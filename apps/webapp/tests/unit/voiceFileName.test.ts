import { describe, expect, it } from "vitest"
import { voiceFileNameForBlob } from "../../src/components/agentic/voiceFileName"

describe("voiceFileNameForBlob", () => {
  it("derives the extension from the recording MIME type", () => {
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "audio/webm" }))).toBe("voz.webm")
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "audio/mp4" }))).toBe("voz.mp4")
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "audio/ogg" }))).toBe("voz.ogg")
  })

  it("ignores codec parameters", () => {
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "audio/webm;codecs=opus" }))).toBe(
      "voz.webm"
    )
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "audio/ogg; codecs=opus" }))).toBe(
      "voz.ogg"
    )
  })

  it("falls back to webm for unknown or empty types", () => {
    expect(voiceFileNameForBlob(new Blob(["a"]))).toBe("voz.webm")
    expect(voiceFileNameForBlob(new Blob(["a"], { type: "application/octet-stream" }))).toBe(
      "voz.webm"
    )
  })
})
