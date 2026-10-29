import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "../http/env.js"
import { ApiError, Errors } from "../http/errors.js"
import { authGuard } from "../http/middleware/auth.js"
import { validate } from "../http/middleware/validate.js"
import type { AuthService } from "../services/auth-service.js"
import { CHAT_MAX_MESSAGES } from "../services/room-ai/chat-repository.js"
import {
  PrivateRoomAiUnavailableError,
  RoomNotFoundError,
  RoomQueueFullError,
  RoomAiMemoryUnavailableError,
  SharedBoardSnapshotNotReadyError,
  type RoomAiService,
} from "../services/room-ai/room-ai-service.js"
import { DiagramIdParams } from "./_schemas.js"
import { RoomAiInferenceCapacityError } from "../services/room-ai/inference-slots.js"
import {
  RoomAiPromptTooLargeError,
  RoomAiTokenizerUnavailableError,
} from "../services/room-ai/room-ai-responder.js"

interface Deps {
  auth: AuthService
  roomAi: RoomAiService
}

const MAX_MESSAGE_CHARS = 4000

const PostMessageBody = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(MAX_MESSAGE_CHARS),
  intent: z.enum(["ask", "change"]),
  replica: z.object({
    generation: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative().safe(),
  }),
  privateContext: z.never().optional(),
})

const PostPrivateMessageBody = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(MAX_MESSAGE_CHARS),
  privateContext: z.string().max(16_000).optional(),
  replica: z.object({
    generation: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative().safe(),
  }),
})

const ListMessagesQuery = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(CHAT_MAX_MESSAGES).optional(),
})

const PinDecisionBody = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(8000),
})

export function mountRoomAiRoutes({ auth, roomAi }: Deps): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use("/rooms/*", authGuard({ auth }))

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
        })
        return c.json(result, 202)
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        if (err instanceof RoomQueueFullError)
          throw new ApiError(429, "ROOM_AI_QUEUE_FULL", err.message)
        if (err instanceof SharedBoardSnapshotNotReadyError) {
          throw new ApiError(409, "ROOM_AI_BOARD_NOT_READY", err.message)
        }
        throw err
      }
    })
  )

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

  // Private input and response exist only for this authenticated HTTP exchange.
  router.post(
    "/rooms/:diagramId/ai/private-messages",
    validate(
      { params: DiagramIdParams, body: PostPrivateMessageBody },
      async (c, { params, body }) => {
        const user = c.get("user")
        if (!user) throw Errors.unauthorized()
        try {
          const result = await roomAi.postPrivateMessage({
            diagramId: params.diagramId,
            author: user,
            text: body.text,
            ...(body.privateContext !== undefined ? { privateContext: body.privateContext } : {}),
            replicaGeneration: body.replica.generation,
            replicaRevision: body.replica.revision,
          })
          return c.json(result, 200)
        } catch (err) {
          if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
          if (err instanceof SharedBoardSnapshotNotReadyError) {
            throw new ApiError(409, "ROOM_AI_BOARD_NOT_READY", err.message)
          }
          if (err instanceof PrivateRoomAiUnavailableError) {
            throw new ApiError(503, "ROOM_AI_PRIVATE_UNAVAILABLE", err.message)
          }
          if (err instanceof RoomAiInferenceCapacityError) {
            throw new ApiError(429, "ROOM_AI_BUSY", "Room AI is at capacity")
          }
          if (err instanceof RoomAiPromptTooLargeError) {
            throw new ApiError(413, "ROOM_AI_CONTEXT_TOO_LARGE", err.message)
          }
          if (err instanceof RoomAiTokenizerUnavailableError) {
            throw new ApiError(503, "ROOM_AI_PRIVATE_UNAVAILABLE", err.message)
          }
          throw err
        }
      }
    )
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
