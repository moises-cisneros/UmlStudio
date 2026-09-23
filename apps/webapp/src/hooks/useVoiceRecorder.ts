import { useState, useEffect, useCallback, useRef } from "react"

export type VoiceRecorderStatus = "idle" | "recording" | "recorded" | "error"

interface UseVoiceRecorderOptions {
  onError?: (message: string) => void
  maxSeconds?: number
}

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  for (const mime of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      // Ignore and try the next candidate
    }
  }
  return ""
}

function mapMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permiso de micrófono denegado: habilitalo en el navegador para grabar audio."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No se encontró ningún micrófono: conectá uno e intentá de nuevo."
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "No se pudo capturar el audio: el micrófono está en uso por otra aplicación."
  }
  return "No se pudo acceder al micrófono para grabar el audio."
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function useVoiceRecorder({ onError, maxSeconds = 120 }: UseVoiceRecorderOptions = {}) {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const [hasSupport] = useState(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined"
  })

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const cancelledRef = useRef(false)
  const audioUrlRef = useRef<string | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  })

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopTracks = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    stream.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore track stopping errors
      }
    })
    streamRef.current = null
  }, [])

  const revokeAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  // Release mic, timer and object URL on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      const staleRecorder = recorderRef.current
      if (staleRecorder && staleRecorder.state !== "inactive") {
        try {
          staleRecorder.stop()
        } catch {
          // Ignore stopping errors during unmount
        }
      }
      streamRef.current?.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignore track stopping errors
        }
      })
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  const fail = useCallback((message: string) => {
    setStatus("error")
    if (onErrorRef.current) onErrorRef.current(message)
  }, [])

  const startRecording = useCallback(async () => {
    if (!hasSupport) {
      fail("Grabación de audio no soportada en este navegador (probá Chrome o Edge).")
      return
    }
    if (recorderRef.current?.state === "recording") return
    cancelledRef.current = false
    revokeAudioUrl()
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      fail(mapMicError(err))
      return
    }
    streamRef.current = stream

    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      stopTracks()
      fail("No se pudo iniciar la grabación de audio en este navegador.")
      return
    }
    chunksRef.current = []
    recorderRef.current = recorder

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      stopTimer()
      stopTracks()
      if (cancelledRef.current) {
        chunksRef.current = []
        setStatus("idle")
        return
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
      chunksRef.current = []
      if (blob.size === 0) {
        fail("La grabación quedó vacía: hablá cerca del micrófono e intentá de nuevo.")
        return
      }
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url
      setAudioBlob(blob)
      setAudioUrl(url)
      setStatus("recorded")
    }
    recorder.onerror = () => {
      stopTimer()
      stopTracks()
      fail("Se interrumpió la grabación de audio: intentá de nuevo.")
    }

    try {
      recorder.start(250)
    } catch {
      stopTracks()
      fail("No se pudo iniciar la grabación de audio en este navegador.")
      return
    }
    startedAtRef.current = Date.now()
    setStatus("recording")
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsed(seconds)
      if (seconds >= maxSeconds) {
        const activeRecorder = recorderRef.current
        if (activeRecorder && activeRecorder.state === "recording") {
          try {
            activeRecorder.stop()
          } catch {
            // Ignore auto-stop errors
          }
        }
      }
    }, 250)
  }, [hasSupport, maxSeconds, stopTimer, stopTracks, revokeAudioUrl, fail])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== "recording") return
    try {
      recorder.stop()
    } catch {
      // onstop/onerror handlers settle the final status
    }
  }, [])

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop()
      } catch {
        stopTimer()
        stopTracks()
        setStatus("idle")
      }
    } else {
      stopTimer()
      stopTracks()
      setStatus("idle")
    }
    revokeAudioUrl()
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
  }, [stopTimer, stopTracks, revokeAudioUrl])

  const resetRecording = useCallback(() => {
    cancelledRef.current = false
    stopTimer()
    revokeAudioUrl()
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setStatus("idle")
  }, [stopTimer, revokeAudioUrl])

  return {
    status,
    isRecording: status === "recording",
    hasRecordedAudio: status === "recorded" && audioBlob !== null,
    elapsed,
    audioBlob,
    audioUrl,
    hasSupport,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecording,
  }
}
