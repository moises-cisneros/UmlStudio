import { MockAIAdapter, validateDiff, type ModelDiff, type UMLModel } from "@umlstudio/core"

export interface ChatResult {
  provider: string
  diff: ModelDiff
  message: string
  isFallback?: boolean
}

export interface SolidViolation {
  principle: string
  severity: "warning" | "error" | "info"
  elementId?: string
  elementName?: string
  message: string
  suggestion: string
}

export interface PatternSuggestion {
  patternName: string
  gofCategory: "Creational" | "Structural" | "Behavioral"
  confidence: number
  description: string
}

export interface AuditResult {
  violations: SolidViolation[]
  suggestions: PatternSuggestion[]
  summary: string
}

const AI_SERVICE_BASE_URL = import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8001"

/**
 * Failure reported to the user instead of a fabricated result.
 * - "unreachable": the request never got an answer (service down, no network).
 * - "http": the service answered with an error status; message carries its detail.
 * - "invalid": the service answered 200 but the payload is not a usable ModelDiff.
 * - "timeout": the request was aborted client-side; never falls back to the Mock (the service may
 *   still be working, so a canned answer would be misleading).
 */
export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: "unreachable" | "http" | "invalid" | "timeout",
    public readonly status?: number
  ) {
    super(message)
    this.name = "AiServiceError"
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown }
    const detail = body.detail ?? body.message
    if (typeof detail === "string" && detail.trim()) return detail
    if (detail && typeof detail === "object") {
      const structured = detail as { message?: unknown; hint?: unknown }
      const parts = [structured.message, structured.hint].filter(
        (part): part is string => typeof part === "string" && part.trim().length > 0
      )
      if (parts.length > 0) return parts.join(" ")
    }
  } catch {
    // Body was not JSON
  }
  return `El servicio de IA respondió con error HTTP ${response.status}.`
}

/**
 * Voice/transcribe budget: a Render cold start (30-60 s) plus speech-to-text plus up to two LLM
 * calls can legitimately take over a minute.
 */
export const VOICE_TIMEOUT_MS = 120_000

function isAbortError(err: unknown): boolean {
  // Duck-typed: DOMException is not always an `Error` instance across realms (jsdom, workers).
  const name = (err as { name?: unknown } | null)?.name
  return name === "AbortError" || name === "TimeoutError"
}

async function postToAiService(
  path: string,
  init: RequestInit,
  timeoutMs?: number
): Promise<Response> {
  let response: Response
  const controller = timeoutMs ? new AbortController() : undefined
  const timer = controller
    ? setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs)
    : undefined
  try {
    response = await fetch(`${AI_SERVICE_BASE_URL}${path}`, {
      method: "POST",
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (err) {
    if (isAbortError(err)) {
      const seconds = timeoutMs ? Math.round(timeoutMs / 1000) : undefined
      throw new AiServiceError(
        seconds
          ? `El servicio de IA no respondió en ${seconds} s. Inténtalo de nuevo en unos segundos.`
          : "El servicio de IA no respondió a tiempo. Inténtalo de nuevo en unos segundos.",
        "timeout"
      )
    }
    throw new AiServiceError(
      "No se pudo conectar con el servicio de IA. Verifica que esté en ejecución e inténtalo de nuevo.",
      "unreachable"
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!response.ok) {
    throw new AiServiceError(await readErrorDetail(response), "http", response.status)
  }
  return response
}

function assertValidDiff(diff: unknown): void {
  const validation = validateDiff(diff)
  if (!validation.valid) {
    throw new AiServiceError(
      `La IA devolvió una propuesta inválida: ${(validation.errors ?? []).slice(0, 3).join("; ")}`,
      "invalid"
    )
  }
}

/**
 * Service to communicate with apps/ai-service (FastAPI :8001).
 * Only the text chat degrades to the MockAIAdapter, and only when the service is unreachable
 * (offline-first). Whenever the service answers, its result or its error is what the user sees:
 * a mock must never impersonate a real transcript or a real model answer.
 */
export class AiService {
  private localAdapter = new MockAIAdapter()

  /**
   * Generates a structured ModelDiff from natural language prompt and current UML model.
   */
  async generateDiff(
    prompt: string,
    currentModel?: UMLModel,
    provider?: string
  ): Promise<ChatResult> {
    try {
      const response = await postToAiService("/api/chat", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: currentModel,
          ...(provider ? { provider } : {}),
        }),
      })
      const data = await response.json()
      assertValidDiff(data.diff)
      return {
        provider: data.provider,
        diff: data.diff,
        message: data.message,
        isFallback: false,
      }
    } catch (err) {
      if (!(err instanceof AiServiceError && err.kind === "unreachable")) throw err
      // Service unreachable -> explicit offline fallback below
    }

    // Client-side fallback using @umlstudio/core MockAIAdapter
    const fallbackDiff = await this.localAdapter.generateDiff(
      prompt,
      currentModel || ({} as UMLModel)
    )

    const elementsCount = fallbackDiff.add?.elements?.length || 0
    return {
      provider: "mock-local (offline-first)",
      diff: fallbackDiff,
      message: `[Modo Offline] Propuesta generada con ${elementsCount} elemento(s) según OMG UML 2.5.`,
      isFallback: true,
    }
  }

  /**
   * Unified voice pipeline: transmits audio to backend, which runs Whisper STT
   * and immediately passes the transcript into the LLM diff engine.
   */
  async generateDiffFromVoice(
    file: Blob,
    currentModel?: UMLModel,
    filename = "voice-input.webm",
    provider?: string
  ): Promise<ChatResult & { transcript?: string }> {
    const formData = new FormData()
    formData.append("file", file, filename)
    if (currentModel) {
      formData.append("model", JSON.stringify(currentModel))
    }
    if (provider) {
      formData.append("provider", provider)
    }

    const response = await postToAiService("/api/chat/voice", { body: formData }, VOICE_TIMEOUT_MS)
    const data = await response.json()
    assertValidDiff(data.diff)
    return {
      provider: data.provider,
      diff: data.diff,
      message: data.message,
      transcript: data.transcript,
      isFallback: false,
    }
  }

  /**
   * Transcribes voice audio file to text via Speech-to-Text endpoint or fallback.
   */
  async transcribeAudio(file: Blob, filename = "voice-input.webm"): Promise<string> {
    const formData = new FormData()
    formData.append("file", file, filename)

    const response = await postToAiService("/api/transcribe", { body: formData }, VOICE_TIMEOUT_MS)
    const data = await response.json()
    return data.text
  }

  /**
   * Audits diagram against SOLID principles and suggests GoF patterns.
   */
  async auditModel(model?: UMLModel): Promise<AuditResult> {
    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || {} }),
      })

      if (response.ok) {
        return await response.json()
      }
    } catch {
      // Fallback
    }

    // Local heuristic SOLID audit
    const violations: SolidViolation[] = []
    const suggestions: PatternSuggestion[] = []
    const nodes = model?.nodes || []

    for (const node of nodes) {
      const nodeData = (node.data || {}) as Record<string, unknown>
      const attrs = Array.isArray(nodeData.attributes) ? nodeData.attributes : []
      const methods = Array.isArray(nodeData.methods) ? nodeData.methods : []
      const name = typeof nodeData.name === "string" ? nodeData.name : "Element"

      if (methods.length > 5 || attrs.length > 6) {
        violations.push({
          principle: "Single Responsibility Principle (SRP)",
          severity: "warning",
          elementId: node.id,
          elementName: name,
          message: `La clase '${name}' acumula ${methods.length} métodos y ${attrs.length} atributos.`,
          suggestion: "Extraer responsabilidades a clases o estrategias desacopladas.",
        })
      }
    }

    if (nodes.length >= 1) {
      suggestions.push({
        patternName: "Strategy Pattern",
        gofCategory: "Behavioral",
        confidence: 0.95,
        description: "Permite aislar familias de algoritmos y hacerlos intercambiables.",
      })
      suggestions.push({
        patternName: "Observer Pattern",
        gofCategory: "Behavioral",
        confidence: 0.9,
        description: "Suscribe múltiples observadores a eventos de un sujeto sin acoplar código.",
      })
    }

    return {
      violations,
      suggestions,
      summary: `Auditoría local: ${violations.length} advertencia(s) SOLID detectada(s).`,
    }
  }

  /**
   * Retrieves status of available LLM providers from apps/ai-service.
   */
  async getProviders(): Promise<{
    default: string
    providers: Record<string, { configured: boolean; model: string }>
  } | null> {
    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/providers`)
      if (response.ok) {
        return await response.json()
      }
    } catch {
      // Backend not running
    }
    return null
  }
}

export const aiService = new AiService()
