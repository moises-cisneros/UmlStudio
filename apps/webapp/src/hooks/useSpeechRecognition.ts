import { useState, useEffect, useCallback, useRef } from "react"

interface SpeechRecognitionHookOptions {
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
  lang?: string
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

// Window type augmentation for Web Speech API
interface IWindow extends Window {
  SpeechRecognition?: {
    new (): SpeechRecognitionInstance
  }
  webkitSpeechRecognition?: {
    new (): SpeechRecognitionInstance
  }
}

function mapSpeechError(error: string): string | null {
  switch (error) {
    case "no-speech":
      return "No se detectó voz: hablá más cerca del micrófono, en voz alta, y probá de nuevo."
    case "audio-capture":
      return "No se pudo capturar el audio: revisá que el micrófono esté conectado y no lo use otra aplicación."
    case "not-allowed":
    case "service-not-allowed":
      return "Permiso de micrófono denegado: habilitalo en el navegador para usar el dictado por voz."
    case "network":
      return "El dictado por voz necesita conexión a internet: revisá tu red e intentá de nuevo."
    case "aborted":
      return null
    default:
      return `El dictado por voz falló (${error}): intentá de nuevo.`
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

export function useSpeechRecognition({
  onResult,
  onError,
  lang = "es-ES",
}: SpeechRecognitionHookOptions = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")

  const [hasSupport] = useState(() => {
    if (typeof window === "undefined") return false
    const win = window as unknown as IWindow
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
  })

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Latest callbacks via refs: the recognition instance must survive
  // re-renders (e.g. every keystroke or interim result). Depending on the
  // closures directly would recreate + abort the session on each render.
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)

  // Sync after render (never during): keeps the stable recognition
  // instance calling the latest callbacks without recreating it.
  useEffect(() => {
    onResultRef.current = onResult
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const win = window as unknown as IWindow
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition

    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = lang

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = ""
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results.item(i)
          if (item && item[0]) {
            currentTranscript += item[0].transcript
          }
        }
        setTranscript(currentTranscript)
        if (onResultRef.current && currentTranscript.trim()) {
          onResultRef.current(currentTranscript)
        }
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false)
        const friendly = mapSpeechError(event.error)
        if (friendly && onErrorRef.current) {
          onErrorRef.current(friendly)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [lang])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    setTranscript("")
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      // Already running or permission blocked
    }
  }, [])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
      setIsListening(false)
    } catch {
      // Ignored
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  return {
    isListening,
    transcript,
    hasSupport,
    startListening,
    stopListening,
    toggleListening,
  }
}
