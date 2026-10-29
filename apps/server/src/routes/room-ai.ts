import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "../http/env.js"
import { ApiError, Errors } from "../http/errors.js"
import { authGuard } from "../http/middleware/auth.js"
import { validate } from "../http/middleware/validate.js"
import type { AuthService } from "../services/auth-service.js"
import { CHAT_MAX_MESSAGES } from "../services/room-ai/chat-repository.js"
import {
  RoomNotFoundError,
  RoomQueueFullError,
  RoomAiMemoryUnavailableError,
  SharedBoardSnapshotNotReadyError,
  type RoomAiService,
} from "../services/room-ai/room-ai-service.js"
import { RoomAiPersonalProfileStaleError } from "../services/room-ai/room-ai-personal-profile.js"
import { DiagramIdParams } from "./_schemas.js"
import { RoomAiTeachingProfileSchema } from "../services/room-ai/room-ai-personal-profile.js"
import { MAX_ROOM_AI_MESSAGE_CHARS } from "../services/room-ai/room-ai-limits.js"
import {
  RoomAiVoiceQuestionTooLongError,
  RoomAiVoiceQuestionUnclearError,
  type RoomAiVoiceQuestionHandler,
} from "../services/room-ai/room-ai-voice-question.js"
import { RoomAiTranscriptionUnavailableError } from "../services/room-ai/room-ai-transcriber.js"

interface Deps {
  auth: AuthService
  roomAi: RoomAiService
  voiceQuestion: RoomAiVoiceQuestionHandler
}

const VoiceQuestionReplica = z.object({
  generation: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().nonnegative().safe(),
})

const PostMessageBody = z
  .object({
    text: z.string().trim().min(1, "text must not be empty").max(MAX_ROOM_AI_MESSAGE_CHARS),
    intent: z.enum(["ask", "change"]),
    replica: z.object({
      generation: z.string().regex(/^[a-f0-9]{64}$/),
      revision: z.number().int().nonnegative().safe(),
    }),
    teachingProfile: RoomAiTeachingProfileSchema.optional(),
    profileRevision: z.string().uuid().optional(),
    personalMemory: z.never().optional(),
    privateContext: z.never().optional(),
  })
  .strict()
  .refine((body) => (body.teachingProfile === undefined) === (body.profileRevision === undefined))

const ListMessagesQuery = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(CHAT_MAX_MESSAGES).optional(),
})

const PinDecisionBody = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(8000),
})

export function mountRoomAiRoutes({ auth, roomAi, voiceQuestion }: Deps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use("/rooms/*", authGuard({ auth }))

  router.get(
    "/rooms/:diagramId/ai/personal-profile/revision",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const user = c.get("user")
      if (!user) throw Errors.unauthorized()
      try {
        return c.json({
          revision: await roomAi.getPersonalProfileRevision(params.diagramId, user.id),
        })
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        throw err
      }
    })
  )

  router.post(
    "/rooms/:diagramId/ai/personal-profile/revoke",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      const user = c.get("user")
      if (!user) throw Errors.unauthorized()
      try {
        return c.json({ revision: await roomAi.revokePersonalProfile(params.diagramId, user.id) })
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        throw err
      }
    })
  )

  // POST /api/rooms/:diagramId/ai/messages — enqueue a message; the author is the JWT user.
  router.post(
    "/rooms/:diagramId/ai/messages",
    validate({ params: DiagramIdParams, body: PostMessageBody }, async (c, { params, body }) => {
      const user = c.get("user")
      if (!user) throw Errors.unauthorized()
      try {
        const result = await roomAi.postMessage({
          diagramId: params.diagramId,
          author: user,
          text: body.text,
          intent: body.intent,
          replica: body.replica,
          ...(body.teachingProfile ? { teachingProfile: body.teachingProfile } : {}),
          ...(body.profileRevision ? { profileRevision: body.profileRevision } : {}),
        })
        return c.json(result, 202)
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        if (err instanceof RoomQueueFullError)
          throw new ApiError(429, "ROOM_AI_QUEUE_FULL", err.message)
        if (err instanceof SharedBoardSnapshotNotReadyError) {
          throw new ApiError(409, "ROOM_AI_BOARD_NOT_READY", err.message)
        }
        if (err instanceof RoomAiPersonalProfileStaleError) {
          throw new ApiError(409, "ROOM_AI_PROFILE_STALE", err.message)
        }
        throw err
      }
    })
  )

  router.post("/rooms/:diagramId/ai/voice", async (c) => {
    const user = c.get("user")
    if (!user) throw Errors.unauthorized()

    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw Errors.badRequest("Voice question must use multipart form data")
    }

    const file = form.get("file")
    if (!(file instanceof File)) throw Errors.badRequest("Audio file is required")
    if (file.size === 0) throw Errors.badRequest("Audio file is empty")
    if (file.type && !file.type.toLowerCase().startsWith("audio/")) {
      throw Errors.badRequest("Uploaded file must be audio")
    }

    const rawReplica = form.get("replica")
    if (typeof rawReplica !== "string") throw Errors.invalidParams("Room replica is required")
    let decodedReplica: unknown
    try {
      decodedReplica = JSON.parse(rawReplica)
    } catch {
      throw Errors.invalidParams("Room replica is invalid")
    }
    const replicaResult = VoiceQuestionReplica.safeParse(decodedReplica)
    if (!replicaResult.success) throw Errors.invalidParams("Room replica is invalid")
    if (form.has("personalMemory")) throw Errors.invalidParams("Raw Room memory is not accepted")
    const rawProfile = form.get("teachingProfile")
    const rawProfileRevision = form.get("profileRevision")
    let teachingProfile: z.infer<typeof RoomAiTeachingProfileSchema> | undefined
    let profileRevision: string | undefined
    if (rawProfile !== null || rawProfileRevision !== null) {
      if (typeof rawProfile !== "string" || typeof rawProfileRevision !== "string") {
        throw Errors.invalidParams("Room teaching profile is invalid")
      }
      let decodedProfile: unknown
      try {
        decodedProfile = JSON.parse(rawProfile)
      } catch {
        throw Errors.invalidParams("Room teaching profile is invalid")
      }
      const profileResult = RoomAiTeachingProfileSchema.safeParse(decodedProfile)
      const revisionResult = z.string().uuid().safeParse(rawProfileRevision)
      if (!profileResult.success || !revisionResult.success) {
        throw Errors.invalidParams("Room teaching profile is invalid")
      }
      teachingProfile = profileResult.data
      profileRevision = revisionResult.data
    }

    try {
      const result = await voiceQuestion({
        diagramId: c.req.param("diagramId"),
        author: user,
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name.split(/[\\/]/).pop()?.slice(0, 255) || "voice-input.webm",
        contentType: file.type,
        replica: replicaResult.data,
        ...(teachingProfile ? { teachingProfile } : {}),
        ...(profileRevision ? { profileRevision } : {}),
      })
      return c.json(result, 202)
    } catch (err) {
      if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
      if (err instanceof RoomQueueFullError) {
        throw new ApiError(429, "ROOM_AI_QUEUE_FULL", err.message)
      }
      if (err instanceof SharedBoardSnapshotNotReadyError) {
        throw new ApiError(409, "ROOM_AI_BOARD_NOT_READY", err.message)
      }
      if (err instanceof RoomAiVoiceQuestionUnclearError) {
        throw Errors.invalidParams("Could not transcribe clear speech")
      }
      if (err instanceof RoomAiVoiceQuestionTooLongError) {
        throw Errors.invalidParams("Transcribed Room question exceeds 4,000 characters")
      }
      if (err instanceof RoomAiPersonalProfileStaleError) {
        throw new ApiError(409, "ROOM_AI_PROFILE_STALE", err.message)
      }
      if (err instanceof RoomAiTranscriptionUnavailableError) {
        throw new ApiError(
          503,
          "ROOM_AI_TRANSCRIPTION_UNAVAILABLE",
          "Room voice transcription is unavailable"
        )
      }
      throw err
    }
  })

  router.get(
    "/rooms/:diagramId/ai/memory",
    validate({ params: DiagramIdParams }, async (c, { params }) => {
      try {
        const memory = await roomAi.getSharedMemory(params.diagramId)
        return c.json({ summary: memory.summary || null, pinnedDecisions: memory.decisions }, 200)
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        if (err instanceof RoomAiMemoryUnavailableError) {
          throw new ApiError(503, "ROOM_AI_MEMORY_UNAVAILABLE", "Room AI memory is unavailable")
        }
        throw err
      }
    })
  )

  router.post(
    "/rooms/:diagramId/ai/memory/pins",
    validate({ params: DiagramIdParams, body: PinDecisionBody }, async (c, { params, body }) => {
      try {
        await roomAi.pinSharedDecision(params.diagramId, body.text)
        return c.json({ text: body.text }, 201)
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        if (err instanceof RoomAiMemoryUnavailableError) {
          throw new ApiError(503, "ROOM_AI_MEMORY_UNAVAILABLE", "Room AI memory is unavailable")
        }
        throw err
      }
    })
  )

  // GET /api/rooms/:diagramId/ai/messages?before&limit — chronological history page.
  router.get(
    "/rooms/:diagramId/ai/messages",
    validate(
      { params: DiagramIdParams, query: ListMessagesQuery },
      async (c, { params, query }) => {
        try {
          const page = await roomAi.listMessages(params.diagramId, {
            ...(query.before !== undefined ? { before: query.before } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
          })
          c.header("X-Has-More", String(page.hasMore))
          return c.json(page.messages, 200)
        } catch (err) {
          if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
          throw err
        }
      }
    )
  )

  return router
}
