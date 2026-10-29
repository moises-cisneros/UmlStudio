import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useVoiceRecorder } from "./useVoiceRecorder"

const getUserMedia = vi.fn()
const recorderStart = vi.fn()

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true)

  state: RecordingState = "inactive"
  mimeType = "audio/webm"
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(...args: unknown[]) {
    void args
  }

  start = recorderStart
}

describe("useVoiceRecorder permission cancellation", () => {
  let mediaDevicesDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices")
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal("MediaRecorder", MockMediaRecorder)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor)
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices")
    }
  })

  it("stops a late stream instead of starting after cancellation during permission", async () => {
    let resolvePermission!: (stream: MediaStream) => void
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        resolvePermission = resolve
      })
    )
    const stopTrack = vi.fn()
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream
    const { result, unmount } = renderHook(() => useVoiceRecorder())

    let startPromise!: Promise<void>
    act(() => {
      startPromise = result.current.startRecording()
    })
    act(() => result.current.cancelRecording())

    await act(async () => {
      resolvePermission(stream)
      await startPromise
    })

    expect(recorderStart).not.toHaveBeenCalled()
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(result.current.status).toBe("idle")
    unmount()
  })
})
