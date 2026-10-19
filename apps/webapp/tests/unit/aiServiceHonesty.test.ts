import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AiService, AiServiceError } from "../../src/services/aiService"

const VALID_DIFF = {
  add: {
    elements: [{ name: "Cliente", type: "class", attributes: [{ name: "+ nombre: String" }] }],
    relationships: [],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const audio = new Blob(["audio"], { type: "audio/webm" })

describe("AiService never fabricates results when the backend answers", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("generateDiff (text)", () => {
    it("returns the backend diff on success", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ provider: "gemini", diff: VALID_DIFF, message: "ok" })
      )
      const result = await new AiService().generateDiff("crea una clase Cliente")
      expect(result.provider).toBe("gemini")
      expect(result.isFallback).toBe(false)
    })

    it("surfaces the backend error detail instead of silently using the mock", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ detail: "Fallo en pipeline de IA: todos los modelos fallaron" }, 502)
      )
      await expect(new AiService().generateDiff("sistema de biblioteca")).rejects.toMatchObject({
        name: "AiServiceError",
        status: 502,
        message: expect.stringContaining("todos los modelos fallaron"),
      })
    })

    it("reads structured FastAPI details ({message, hint})", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ detail: { message: "Prompt inválido", hint: "Escribe algo" } }, 400)
      )
      await expect(new AiService().generateDiff("x")).rejects.toThrow("Prompt inválido")
    })

    it("rejects an invalid diff from the backend instead of masking it", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          provider: "gemini",
          diff: { add: { relationships: [{ type: "ClassInheritance" }] } },
          message: "ok",
        })
      )
      await expect(new AiService().generateDiff("herencia")).rejects.toBeInstanceOf(AiServiceError)
    })

    it("keeps the explicit offline fallback only when the backend is unreachable", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
      const result = await new AiService().generateDiff("Crear patrón Strategy con Contexto")
      expect(result.isFallback).toBe(true)
      expect(result.message).toContain("Modo Offline")
    })
  })

  describe("generateDiffFromVoice", () => {
    it("returns transcript and diff on success", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          provider: "gemini",
          diff: VALID_DIFF,
          message: "ok",
          transcript: "Crea una clase Cliente",
        })
      )
      const result = await new AiService().generateDiffFromVoice(audio)
      expect(result.transcript).toBe("Crea una clase Cliente")
      expect(result.isFallback).toBe(false)
    })

    it("does not invent a transcript when the speech engine is down (503)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ detail: "El motor de voz no está disponible: sin modelo" }, 503)
      )
      await expect(new AiService().generateDiffFromVoice(audio)).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("motor de voz"),
      })
    })

    it("surfaces 'could not understand the audio' (400) to the user", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ detail: "No se entendió el audio con suficiente claridad." }, 400)
      )
      await expect(new AiService().generateDiffFromVoice(audio)).rejects.toThrow("claridad")
    })

    it("fails loudly (no mock diagram) when the backend is unreachable", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
      await expect(new AiService().generateDiffFromVoice(audio)).rejects.toMatchObject({
        name: "AiServiceError",
        kind: "unreachable",
      })
    })
  })

  describe("voice timeout", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function hangUntilAborted() {
      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason ?? new DOMException("aborted", "AbortError"))
            )
          })
      )
    }

    it("aborts the voice request after 120 s with kind 'timeout'", async () => {
      vi.useFakeTimers()
      hangUntilAborted()
      const pending = new AiService().generateDiffFromVoice(audio)
      const assertion = expect(pending).rejects.toMatchObject({
        name: "AiServiceError",
        kind: "timeout",
      })
      await vi.advanceTimersByTimeAsync(120_000)
      await assertion
    })

    it("does not abort before 120 s", async () => {
      vi.useFakeTimers()
      hangUntilAborted()
      const pending = new AiService().generateDiffFromVoice(audio)
      pending.catch(() => undefined)
      await vi.advanceTimersByTimeAsync(119_000)
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(2_000)
      await expect(pending).rejects.toMatchObject({ kind: "timeout" })
    })

    it("aborts transcribe after 120 s with kind 'timeout'", async () => {
      vi.useFakeTimers()
      hangUntilAborted()
      const pending = new AiService().transcribeAudio(audio)
      const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" })
      await vi.advanceTimersByTimeAsync(120_000)
      await assertion
    })

    it("a timeout never triggers the Mock fallback", async () => {
      fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"))
      await expect(new AiService().generateDiff("sistema de biblioteca")).rejects.toMatchObject({
        kind: "timeout",
      })
    })
  })

  describe("transcribeAudio", () => {
    it("returns the real transcription", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ text: "hola mundo", confidence: 0.9 }))
      expect(await new AiService().transcribeAudio(audio)).toBe("hola mundo")
    })

    it("never returns a canned phrase when transcription fails", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ detail: "motor de voz no disponible" }, 503))
      await expect(new AiService().transcribeAudio(audio)).rejects.toBeInstanceOf(AiServiceError)
    })

    it("never returns a canned phrase when the backend is unreachable", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
      await expect(new AiService().transcribeAudio(audio)).rejects.toBeInstanceOf(AiServiceError)
    })
  })
})
