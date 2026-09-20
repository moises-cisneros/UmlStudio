import {
  MockAIAdapter,
  validateDiff,
  type ModelDiff,
  type UMLModel,
} from "@umlstudio/core";

export interface ChatResult {
  provider: string;
  diff: ModelDiff;
  message: string;
  isFallback?: boolean;
}

export interface SolidViolation {
  principle: string;
  severity: "warning" | "error" | "info";
  elementId?: string;
  elementName?: string;
  message: string;
  suggestion: string;
}

export interface PatternSuggestion {
  patternName: string;
  gofCategory: "Creational" | "Structural" | "Behavioral";
  confidence: number;
  description: string;
}

export interface AuditResult {
  violations: SolidViolation[];
  suggestions: PatternSuggestion[];
  summary: string;
}

const AI_SERVICE_BASE_URL =
  import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8001";

/**
 * Service to communicate with apps/ai-service (FastAPI :8001)
 * with transparent client-side fallback to MockAIAdapter for offline resilience.
 */
export class AiService {
  private localAdapter = new MockAIAdapter();

  /**
   * Generates a structured ModelDiff from natural language prompt and current UML model.
   */
  async generateDiff(
    prompt: string,
    currentModel?: UMLModel,
    provider?: string,
  ): Promise<ChatResult> {
    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: currentModel,
          ...(provider ? { provider } : {}),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const validation = validateDiff(data.diff);
        if (validation.valid) {
          return {
            provider: data.provider,
            diff: data.diff,
            message: data.message,
            isFallback: false,
          };
        }
      }
    } catch {
      // Backend not running or unreachable -> Graceful offline fallback
    }

    // Client-side fallback using @umlstudio/core MockAIAdapter
    const fallbackDiff = await this.localAdapter.generateDiff(
      prompt,
      currentModel || ({} as UMLModel),
    );

    const elementsCount = fallbackDiff.add?.elements?.length || 0;
    return {
      provider: "mock-local (offline-first)",
      diff: fallbackDiff,
      message: `[Modo Offline] Propuesta generada con ${elementsCount} elemento(s) según OMG UML 2.5.`,
      isFallback: true,
    };
  }

  /**
   * Unified voice pipeline: transmits audio to backend, which runs Whisper STT
   * and immediately passes the transcript into the LLM diff engine.
   */
  async generateDiffFromVoice(
    file: Blob,
    currentModel?: UMLModel,
    filename = "voice-input.webm",
  ): Promise<ChatResult & { transcript?: string }> {
    try {
      const formData = new FormData();
      formData.append("file", file, filename);
      if (currentModel) {
        formData.append("model", JSON.stringify(currentModel));
      }

      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/chat/voice`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const validation = validateDiff(data.diff);
        if (validation.valid) {
          return {
            provider: data.provider,
            diff: data.diff,
            message: data.message,
            transcript: data.transcript,
            isFallback: false,
          };
        }
      }
    } catch {
      // Fallback
    }

    const fallbackText = "Modelado de clases por voz";
    const fallbackDiff = await this.localAdapter.generateDiff(
      fallbackText,
      currentModel || ({} as UMLModel),
    );

    return {
      provider: "mock-local (offline-first)",
      diff: fallbackDiff,
      message: "[Modo Offline] Audio procesado localmente con Mock Adapter.",
      transcript: fallbackText,
      isFallback: true,
    };
  }

  /**
   * Transcribes voice audio file to text via Speech-to-Text endpoint or fallback.
   */
  async transcribeAudio(
    file: Blob,
    filename = "voice-input.webm",
  ): Promise<string> {
    try {
      const formData = new FormData();
      formData.append("file", file, filename);

      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return data.text;
      }
    } catch {
      // Fallback
    }

    return "Crear patrón Strategy con Contexto y 2 estrategias";
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
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback
    }

    // Local heuristic SOLID audit
    const violations: SolidViolation[] = [];
    const suggestions: PatternSuggestion[] = [];
    const nodes = model?.nodes || [];

    for (const node of nodes) {
      const nodeData = (node.data || {}) as Record<string, unknown>;
      const attrs = Array.isArray(nodeData.attributes)
        ? nodeData.attributes
        : [];
      const methods = Array.isArray(nodeData.methods) ? nodeData.methods : [];
      const name =
        typeof nodeData.name === "string" ? nodeData.name : "Element";

      if (methods.length > 5 || attrs.length > 6) {
        violations.push({
          principle: "Single Responsibility Principle (SRP)",
          severity: "warning",
          elementId: node.id,
          elementName: name,
          message: `La clase '${name}' acumula ${methods.length} métodos y ${attrs.length} atributos.`,
          suggestion:
            "Extraer responsabilidades a clases o estrategias desacopladas.",
        });
      }
    }

    if (nodes.length >= 1) {
      suggestions.push({
        patternName: "Strategy Pattern",
        gofCategory: "Behavioral",
        confidence: 0.95,
        description:
          "Permite aislar familias de algoritmos y hacerlos intercambiables.",
      });
      suggestions.push({
        patternName: "Observer Pattern",
        gofCategory: "Behavioral",
        confidence: 0.9,
        description:
          "Suscribe múltiples observadores a eventos de un sujeto sin acoplar código.",
      });
    }

    return {
      violations,
      suggestions,
      summary: `Auditoría local: ${violations.length} advertencia(s) SOLID detectada(s).`,
    };
  }

  /**
   * Retrieves status of available LLM providers from apps/ai-service.
   */
  async getProviders(): Promise<{
    default: string;
    providers: Record<string, { configured: boolean; model: string }>;
  } | null> {
    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/api/providers`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Backend not running
    }
    return null;
  }
}

export const aiService = new AiService();
