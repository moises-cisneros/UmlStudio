import React, { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "react-toastify"
import { Button } from "@umlstudio/ui/components/button"
import { DialogFooter } from "@umlstudio/ui/components/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@umlstudio/ui/components/tabs"
import { useEditorContext, useModalContext } from "@/contexts"
import { useTranslation } from "@/i18n"
import { useAuthStore } from "@/stores/useAuthStore"
import { setTrackingPaused } from "@/utils/localProductivityTracker"
import { HomeDialogContent } from "./HomeDialog"
import {
  fetchProductivityReport,
  computeLocalProductivityReport,
  auditProductivityWithAi,
  exportProductivityAsJson,
  type DiagramProductivityReport,
  type ProductivityAiAuditResponse,
} from "@/services/productivityService"

interface ProductivityModalProps {
  onClose?: () => void
  diagramId?: string
}

export const ProductivityModal: React.FC<ProductivityModalProps> = ({
  onClose,
  diagramId: propDiagramId,
}) => {
  const { t } = useTranslation()
  const { editor } = useEditorContext()
  const { closeModal } = useModalContext()
  const user = useAuthStore((s) => s.user)

  const activeDiagramId = propDiagramId || editor?.model?.id || "default-diagram"
  const model = editor?.model

  const isLocalDiagram =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/local") ||
      !window.location.pathname.startsWith("/shared"))

  const [report, setReport] = useState<DiagramProductivityReport | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<string>("bottlenecks")
  const [aiAudit, setAiAudit] = useState<ProductivityAiAuditResponse | null>(null)
  const [loadingAi, setLoadingAi] = useState<boolean>(false)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    if (isLocalDiagram) {
      setReport(computeLocalProductivityReport(activeDiagramId, model, user))
      setLoading(false)
      return
    }
    try {
      const data = await fetchProductivityReport(activeDiagramId)
      if (
        data &&
        (data.collaborators.length > 0 ||
          data.totalActiveSeconds > 0 ||
          data.bottlenecks.length > 0)
      ) {
        setReport(data)
      } else {
        setReport(computeLocalProductivityReport(activeDiagramId, model, user))
      }
    } catch {
      setReport(computeLocalProductivityReport(activeDiagramId, model, user))
    } finally {
      setLoading(false)
    }
  }, [activeDiagramId, isLocalDiagram, model, user])

  useEffect(() => {
    // Al ingresar al modal, el usuario queda inactivo en el diagrama
    setTrackingPaused(true)
    if (editor && typeof editor.setLocalAwarenessCursor === "function") {
      editor.setLocalAwarenessCursor(null)
    }

    let ignore = false
    const fetchInitial = async () => {
      // Para diagrama local: 100% en memoria, cero sockets y cero red
      if (isLocalDiagram) {
        if (!ignore) {
          setReport(computeLocalProductivityReport(activeDiagramId, model, user))
          setLoading(false)
        }
        return
      }

      // Para colaborativo: una única foto fija de lo que llevan trabajando hasta ese momento
      try {
        const data = await fetchProductivityReport(activeDiagramId)
        if (ignore) return
        if (
          data &&
          (data.collaborators.length > 0 ||
            data.totalActiveSeconds > 0 ||
            data.bottlenecks.length > 0)
        ) {
          setReport(data)
        } else {
          setReport(computeLocalProductivityReport(activeDiagramId, model, user))
        }
      } catch {
        if (!ignore) {
          setReport(computeLocalProductivityReport(activeDiagramId, model, user))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void fetchInitial()
    return () => {
      ignore = true
      setTrackingPaused(false)
    }
  }, [activeDiagramId, isLocalDiagram, model, user, editor])

  const handleAiAudit = async () => {
    if (!report) return
    setLoadingAi(true)
    try {
      const result = await auditProductivityWithAi(report)
      setAiAudit(result)
      toast.success("Diagnóstico generado con éxito")
    } catch {
      toast.error("No se pudo contactar al servicio de IA")
    } finally {
      setLoadingAi(false)
    }
  }

  const formatSeconds = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remMins = mins % 60
      return `${hours}h ${remMins}m`
    }
    return `${mins}m ${secs}s`
  }

  const fluencyColor = useMemo(() => {
    if (!report) return "var(--success, #10b981)"
    switch (report.fluencyStatus) {
      case "green":
        return "#10b981"
      case "yellow":
        return "#f59e0b"
      case "red":
        return "#ef4444"
      default:
        return "#10b981"
    }
  }, [report])

  const fluencyLabel = useMemo(() => {
    if (!report) return "Óptimo"
    switch (report.fluencyStatus) {
      case "green":
        return "Flujo Continuo (Verde)"
      case "yellow":
        return "Contención Moderada (Amarillo)"
      case "red":
        return "Cuello de Botella Crítico (Rojo)"
      default:
        return "Normal"
    }
  }, [report])

  const handlePrint = () => {
    window.print()
  }

  return (
    <HomeDialogContent>
      <div className="flex flex-col gap-5 p-2 text-foreground">
        {/* Header Summary Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 rounded-full animate-pulse shadow-sm"
              style={{ backgroundColor: fluencyColor }}
            />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Estado de Fluidez: {fluencyLabel}
              </div>
              <div className="text-xs text-muted-foreground">
                Diagrama: {activeDiagramId} • Puntuación: {report?.fluencyScore ?? 100}/100
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMetrics()}
              disabled={loading}
            >
              {loading ? "Actualizando..." : "Refrescar"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (report) exportProductivityAsJson(report, `productivity-${activeDiagramId}.json`)
              }}
              disabled={!report}
            >
              Exportar JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!report}>
              Imprimir
            </Button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <div className="text-xs font-medium text-muted-foreground">Tiempo Activo</div>
            <div className="text-lg font-bold text-foreground">
              {report ? formatSeconds(report.totalActiveSeconds) : "--"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <div className="text-xs font-medium text-muted-foreground">Tiempo Inactivo</div>
            <div className="text-lg font-bold text-foreground">
              {report ? formatSeconds(report.totalIdleSeconds) : "--"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <div className="text-xs font-medium text-muted-foreground">Velocidad de Clases</div>
            <div className="text-lg font-bold text-foreground">
              {report ? `${report.velocity.classesPerHour}/h` : "--"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
            <div className="text-xs font-medium text-muted-foreground">Cadencia Refactor</div>
            <div className="text-lg font-bold text-foreground">
              {report ? `${report.velocity.refactorsPerHour}/h` : "--"}
            </div>
          </div>
        </div>

        {/* Tabbed Analytics Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full border border-border bg-muted/50 p-1">
            <TabsTrigger value="bottlenecks">Cuellos de Botella</TabsTrigger>
            <TabsTrigger value="collaborators">Colaboradores</TabsTrigger>
            <TabsTrigger value="ai">Diagnóstico IA</TabsTrigger>
          </TabsList>

          {/* TAB 1: Bottlenecks */}
          <TabsContent value="bottlenecks" className="pt-3">
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Detección de nodos con bloqueos prolongados o colisiones concurrentes entre
                colaboradores.
              </div>

              {report && report.bottlenecks.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {report.bottlenecks.map((b) => (
                    <div
                      key={b.nodeId}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/10 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-sm text-foreground">
                          {b.nodeName || b.nodeId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID: {b.nodeId} • Retención media:{" "}
                          {Math.round(b.averageLockDurationMs / 1000)}s
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.contentionCount > 0 ? (
                          <span className="px-2 py-0.5 text-xs font-bold bg-destructive/15 text-destructive rounded-md">
                            {b.contentionCount} colisión(es)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-500 rounded-md">
                            Sobrecarga de diseño
                          </span>
                        )}
                        {b.currentHolderUserId && (
                          <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-md">
                            En edición
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground text-sm">
                  ✓ No se detectaron cuellos de botella ni disputas de locks en la sesión.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: Collaborators */}
          <TabsContent value="collaborators" className="pt-3">
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Distribución de actividad cronométrica por modelador.
              </div>

              {report && report.collaborators.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {report.collaborators.map((c) => (
                    <div
                      key={c.userId}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-xs"
                          style={{
                            backgroundColor: c.userColor || "var(--primary)",
                          }}
                        >
                          {c.userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-foreground">{c.userName}</div>
                          <div className="text-xs text-muted-foreground">ID: {c.userId}</div>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold text-foreground">
                          Activo: {formatSeconds(c.activeSeconds)}
                        </div>
                        <div className="text-muted-foreground">
                          Inactivo: {formatSeconds(c.idleSeconds)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground text-sm">
                  Sin colaboradores activos registrados en la sesión.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 3: AI Diagnostic */}
          <TabsContent value="ai" className="pt-3">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Diagnóstico heurístico por IA y recomendaciones de patrones GoF.
                </span>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void handleAiAudit()}
                  disabled={loadingAi || !report}
                >
                  {loadingAi ? "Analizando..." : "Analizar con IA"}
                </Button>
              </div>

              {aiAudit ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div>
                    <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                      Diagnóstico de Dinámica
                    </div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {aiAudit.diagnosis}
                    </div>
                  </div>

                  {aiAudit.recommendations.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Recomendaciones
                      </div>
                      <ul className="mt-1 space-y-1 list-disc list-inside text-xs text-foreground">
                        {aiAudit.recommendations.map((rec) => (
                          <li key={rec}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiAudit.pattern_suggestions.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Patrones GoF Sugeridos para Desacoplamiento
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {aiAudit.pattern_suggestions.map((p) => (
                          <div
                            key={p.pattern_name}
                            className="p-2.5 rounded-md border border-border/80 bg-background/50 text-xs"
                          >
                            <div className="flex items-center justify-between font-bold text-foreground">
                              <span>{p.pattern_name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                {p.gof_category}
                              </span>
                            </div>
                            <div className="text-muted-foreground text-[11px] mt-1">
                              {p.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground text-sm">
                  {report && report.bottlenecks.length === 0
                    ? '✓ No se detectaron cuellos de botella en el sistema. Presioná "Analizar con IA" para verificar el estado de fluidez.'
                    : 'Presioná "Analizar con IA" para analizar los cuellos de botella detectados y obtener recomendaciones de solución.'}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <DialogFooter className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          onClick={() => {
            if (onClose) onClose()
            else closeModal()
          }}
        >
          {t.common?.close || "Cerrar"}
        </Button>
      </DialogFooter>
    </HomeDialogContent>
  )
}
