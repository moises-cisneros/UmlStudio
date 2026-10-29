import { z } from "zod"
import {
  RoomAiTeachingProfileSchema,
  type RoomAiTeachingProfile,
} from "./room-ai-personal-profile.js"

interface RoomAiProfileDeriverOptions {
  serviceUrl: string
  internalToken: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

export interface RoomAiProfileInput {
  detailLevel: "concise" | "balanced" | "step_by_step"
  exampleStyle: "uml" | "code" | "analogy" | "none"
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  )
}

const ResponseSchema = z.object({ profile: RoomAiTeachingProfileSchema }).strict()

/** Sends only the closed profile and current public interaction to self-hosted inference. */
export function createRoomAiProfileDeriver(options: RoomAiProfileDeriverOptions) {
  const fetcher = options.fetcher ?? fetch
  return async function derive(
    profile: RoomAiProfileInput,
    interaction: string
  ): Promise<RoomAiTeachingProfile> {
    if (!options.internalToken.trim() || !options.serviceUrl.trim()) {
      throw new Error("Room AI profile derivation is not configured")
    }

    let endpoint: URL
    try {
      endpoint = new URL("/internal/v1/room/profile", options.serviceUrl)
    } catch {
      throw new Error("Room AI profile derivation is not configured")
    }
    if (
      !new Set(["http:", "https:"]).has(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      (endpoint.protocol === "http:" && !isLoopback(endpoint.hostname))
    ) {
      throw new Error("Room AI profile derivation is not configured")
    }

    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": options.internalToken,
        },
        body: JSON.stringify({ profile, interaction }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
        redirect: "error",
      })
    } catch {
      throw new Error("Room AI profile derivation failed")
    }
    if (!response.ok) throw new Error("Room AI profile derivation failed")

    let output: unknown
    try {
      output = await response.json()
    } catch {
      throw new Error("Room AI returned an invalid profile")
    }
    const parsed = ResponseSchema.safeParse(output)
    if (!parsed.success) throw new Error("Room AI returned an invalid profile")
    return parsed.data.profile
  }
}
