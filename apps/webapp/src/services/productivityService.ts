import { serverURL } from "@/constants"

export interface CollaboratorTimeMetric {
  userId: string
  userName: string
  userColor?: string
  activeSeconds: number
  idleSeconds: number
  lastActiveTimestamp: number
}

export interface NodeContentionMetric {
  nodeId: string
  nodeName: string
  contentionCount: number
  totalLockDurationMs: number
  averageLockDurationMs: number
  currentHolderUserId?: string
}

export type FluencyStatus = "green" | "yellow" | "red"

export interface DiagramProductivityReport {
  diagramId: string
  sessionStartedAt: number
  lastUpdatedAt: number
  totalActiveSeconds: number
  totalIdleSeconds: number
  collaborators: CollaboratorTimeMetric[]
  bottlenecks: NodeContentionMetric[]
  velocity: {
    classesPerHour: number
    methodsPerHour: number
    refactorsPerHour: number
    totalClassesCreated: number
    totalMethodsCreated: number
    totalRefactors: number
  }
  fluencyStatus: FluencyStatus
  fluencyScore: number
}

export interface ProductivityAiAuditResponse {
  diagnosis: string
  recommendations: string[]
  pattern_suggestions: Array<{
    pattern_name: string
    gof_category: string
    confidence: number
    description: string
  }>
  fluency_status: string
}

const AI_SERVICE_BASE_URL = import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8001"

export async function fetchProductivityReport(
  diagramId: string
): Promise<DiagramProductivityReport> {
  const url = `${serverURL}/api/diagrams/${encodeURIComponent(diagramId)}/productivity`
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch productivity report: HTTP ${response.status}`)
  }

  return (await response.json()) as DiagramProductivityReport
}

export async function auditProductivityWithAi(
  report: DiagramProductivityReport
): Promise<ProductivityAiAuditResponse> {
  const payload = {
    diagram_id: report.diagramId,
    bottlenecks: report.bottlenecks,
    velocity: report.velocity,
    fluency_status: report.fluencyStatus,
    fluency_score: report.fluencyScore,
  }

  try {
    const res = await fetch(`${AI_SERVICE_BASE_URL}/api/audit/productivity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      return (await res.json()) as ProductivityAiAuditResponse
    }
  } catch {
    // Fallback to local heuristic evaluation if AI service is offline
  }

  // Graceful heuristic fallback
  const isRed = report.fluencyStatus === "red"
  const isYellow = report.fluencyStatus === "yellow"

  const recommendations: string[] = []
  if (report.bottlenecks.length > 0) {
    for (const b of report.bottlenecks) {
      if (b.contentionCount > 0 || b.averageLockDurationMs > 45000) {
        recommendations.push(
          `Desacoplar '${b.nodeName || b.nodeId}': dividir métodos y atributos en clases colaboradoras para habilitar edición paralela.`
        )
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "La fluidez del diseño es óptima; mantener la modularidad actual entre paquetes y clases."
    )
  }

  return {
    diagnosis: isRed
      ? "Alerta crítica de contención: se detectaron disputas concurrentes recurrentes sobre nodos clave."
      : isYellow
        ? "Contención moderada: algunos colaboradores compiten por la edición de los mismos artefactos."
        : "Flujo de diseño continuo y sin fricciones detectadas.",
    recommendations,
    pattern_suggestions:
      isRed || isYellow
        ? [
            {
              pattern_name: "Facade",
              gof_category: "Structural",
              confidence: 0.9,
              description:
                "Unifica subsistemas complejos detrás de una interfaz simplificada para evitar bloqueos directos sobre clases centrales.",
            },
            {
              pattern_name: "Strategy",
              gof_category: "Behavioral",
              confidence: 0.85,
              description:
                "Aísla comportamientos variables en estrategias desacopladas, permitiendo que múltiples modeladores trabajen sin interferencia.",
            },
          ]
        : [],
    fluency_status: report.fluencyStatus,
  }
}

export function exportProductivityAsJson(
  report: DiagramProductivityReport,
  filename = "productivity-report.json"
): void {
  const dataStr =
    "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2))
  const downloadAnchor = document.createElement("a")
  downloadAnchor.setAttribute("href", dataStr)
  downloadAnchor.setAttribute("download", filename)
  document.body.appendChild(downloadAnchor)
  downloadAnchor.click()
  downloadAnchor.remove()
}
