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
  type RoomAiService,
} from "../services/room-ai/room-ai-service.js"
import { DiagramIdParams } from "./_schemas.js"

interface Deps {
  auth: AuthService
  roomAi: RoomAiService
}

const MAX_MESSAGE_CHARS = 4000

const PostMessageBody = z.object({
  text: z.string().trim().min(1, "text must not be empty").max(MAX_MESSAGE_CHARS),
  intent: z.enum(["ask", "change"]),
})

const ListMessagesQuery = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(CHAT_MAX_MESSAGES).optional(),
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
        })
        return c.json(result, 202)
      } catch (err) {
        if (err instanceof RoomNotFoundError) throw Errors.notFound("room not found")
        if (err instanceof RoomQueueFullError)
          throw new ApiError(429, "ROOM_AI_QUEUE_FULL", err.message)
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
