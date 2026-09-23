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

import type { UMLModel } from "@umlstudio/core"
import { getLocalSessionStats } from "@/utils/localProductivityTracker"

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

export function computeLocalProductivityReport(
  diagramId: string,
  model?: UMLModel | null,
  currentUser?: { id?: string; name?: string; color?: string } | null
): DiagramProductivityReport {
  const session = getLocalSessionStats(diagramId)
  const nodes = model?.nodes || []

  const classNodes = nodes.filter(
    (n) => (n as unknown as { type?: string }).type === "Class" || !("type" in n)
  )
  const totalClasses = classNodes.length
  let totalMethods = 0
  for (const node of classNodes) {
    const rawNode = node as unknown as { methods?: unknown[] }
    totalMethods += rawNode.methods?.length || 0
  }

  // Active time since the user joined/opened the diagram
  const activeSeconds = Math.max(session.activeSeconds, 0)
  const idleSeconds = session.idleSeconds
  const effectiveHours = Math.max(activeSeconds / 3600, 1 / 60)

  const classesPerHour = Math.round((totalClasses / effectiveHours) * 10) / 10
  const methodsPerHour = Math.round((totalMethods / effectiveHours) * 10) / 10
  const refactorsPerHour = Math.round((session.refactors / effectiveHours) * 10) / 10

  const bottlenecks: NodeContentionMetric[] = []

  const collaborators: CollaboratorTimeMetric[] = [
    {
      userId: currentUser?.id || "local-modeler",
      userName: currentUser?.name || "Modelador Principal",
      userColor: currentUser?.color || "#3b82f6",
      activeSeconds,
      idleSeconds,
      lastActiveTimestamp: session.lastActiveTimestamp,
    },
  ]

  return {
    diagramId,
    sessionStartedAt: session.sessionStartedAt,
    lastUpdatedAt: Date.now(),
    totalActiveSeconds: activeSeconds,
    totalIdleSeconds: idleSeconds,
    collaborators,
    bottlenecks,
    velocity: {
      classesPerHour,
      methodsPerHour,
      refactorsPerHour,
      totalClassesCreated: totalClasses,
      totalMethodsCreated: totalMethods,
      totalRefactors: session.refactors,
    },
    fluencyStatus: "green",
    fluencyScore: 100,
  }
}

export async function auditProductivityWithAi(
  report: DiagramProductivityReport
): Promise<ProductivityAiAuditResponse> {
  const hasBottlenecks = report.bottlenecks && report.bottlenecks.length > 0

  // Si no hay cuellos de botella detectados en el sistema, no hay recomendación de solución
  if (!hasBottlenecks) {
    return {
      diagnosis: "No se detectaron cuellos de botella en el sistema.",
      recommendations: [],
      pattern_suggestions: [],
      fluency_status: report.fluencyStatus || "green",
    }
  }

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

  // Fallback heurístico solo si hay cuellos de botella
  const isRed = report.fluencyStatus === "red"
  const recommendations: string[] = []

  for (const b of report.bottlenecks) {
    if (b.contentionCount > 0) {
      recommendations.push(
        `Resolver contención en '${b.nodeName || b.nodeId}': desacoplar métodos para evitar bloqueos simultáneos entre colaboradores.`
      )
    } else {
      recommendations.push(
        `Optimizar retención en '${b.nodeName || b.nodeId}': dividir la clase para permitir edición paralela.`
      )
    }
  }

  const pattern_suggestions = [
    {
      pattern_name: "Facade",
      gof_category: "Structural",
      confidence: 0.9,
      description:
        "Unifica subsistemas complejos detrás de una interfaz simplificada para evitar sobrecargar clases centrales.",
    },
    {
      pattern_name: "Strategy",
      gof_category: "Behavioral",
      confidence: 0.85,
      description:
        "Aísla comportamientos variables en estrategias desacopladas para evitar bloqueos sobre una sola clase.",
    },
  ]

  return {
    diagnosis: isRed
      ? "Alerta crítica de contención: se detectaron disputas concurrentes recurrentes sobre nodos clave."
      : "Contención moderada: algunos colaboradores compiten por la edición de los mismos artefactos.",
    recommendations,
    pattern_suggestions,
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
