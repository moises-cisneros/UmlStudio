import { describe, expect, it, vi } from "vitest"
import { createRoomAiProfileDeriver } from "./room-ai-profile-deriver.js"

describe("Room AI private profile deriver", () => {
  it("sends only the prior closed profile and current interaction to the internal endpoint", async () => {
    const profile = { detailLevel: "balanced", exampleStyle: "none" } as const
    const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "X-Internal-Token": "internal-secret" })
      expect(JSON.parse(String(init?.body))).toEqual({
        profile,
        interaction: "Explain this with a UML example",
      })
      return Response.json({
        profile: { detailLevel: "balanced", exampleStyle: "analogy" },
      })
    })
    const derive = createRoomAiProfileDeriver({
      serviceUrl: "http://127.0.0.1:8001/",
      internalToken: "internal-secret",
      fetcher,
    })

    await expect(derive(profile, "Explain this with a UML example")).resolves.toEqual({
      detailLevel: "balanced",
      exampleStyle: "analogy",
    })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8001/internal/v1/room/profile"
    )
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error")
  })

  it("rejects malformed profile output and does not fall back to a public provider", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ profile: { detailLevel: "balanced", exampleStyle: "uml", note: "private" } })
    )
    const derive = createRoomAiProfileDeriver({
      serviceUrl: "https://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(
      derive({ detailLevel: "balanced", exampleStyle: "none" }, "Explain this")
    ).rejects.toThrow("invalid profile")
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("rejects insecure non-loopback endpoints before sending the interaction", async () => {
    const fetcher = vi.fn()
    const derive = createRoomAiProfileDeriver({
      serviceUrl: "http://ai.internal",
      internalToken: "secret",
      fetcher,
    })
    await expect(
      derive({ detailLevel: "balanced", exampleStyle: "none" }, "Explain this")
    ).rejects.toThrow("not configured")
    expect(fetcher).not.toHaveBeenCalled()
  })
})
