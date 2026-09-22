import { useState, type FC } from "react"
import {
  SparklesIcon,
  SendIcon,
  CheckCircleIcon,
  XCircleIcon,
  MicIcon,
  MicOffIcon,
  LockIcon,
  EyeIcon,
} from "lucide-react"
import { toast } from "react-toastify"
import { applyDiff, type ModelDiff } from "@umlstudio/core"
import { useEditorContext } from "@/contexts"
import { useTranslation } from "@/i18n"
import { aiService } from "@/services/aiService"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"

interface DiffProposalItem {
  type: "add" | "mod" | "del"
  text: string
}

interface ChatMessage {
  id: string
  sender: "user" | "agent"
  text: string
  diffProposal?: {
    title: string
    items: DiffProposalItem[]
    applied?: boolean
    rawDiff?: ModelDiff
  }
}

export const AgentChatStream: FC = () => {
  const { editor } = useEditorContext()
  const { t } = useTranslation()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [promptText, setPromptText] = useState("")
  const [isThinking, setIsThinking] = useState(false)

  const [providerMode, setProviderMode] = useState<"auto" | "local" | "cloud">(() => {
    try {
      const saved = localStorage.getItem("umlstudio_ai_mode")
      return saved === "local" || saved === "cloud" || saved === "auto" ? saved : "auto"
    } catch {
      return "auto"
    }
  })

  const handleModeChange = (mode: "auto" | "local" | "cloud") => {
    setProviderMode(mode)
    try {
      localStorage.setItem("umlstudio_ai_mode", mode)
    } catch {
      // ignore storage errors
    }
  }

  const isReadonly = Boolean(
    editor?.isReadonly?.() ||
    (editor as unknown as { options?: { readonly?: boolean } })?.options?.readonly
  )

  // Speech-to-Text hook
  const {
    isListening,
    toggleListening,
    hasSupport: speechSupported,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      setPromptText(transcript)
    },
    onError: (err) => {
      toast.warn(`Entrada de voz: ${err}`)
    },
  })

  const handleSendPrompt = async (textToSend?: string) => {
    const text = (textToSend ?? promptText).trim()
    if (!text) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text,
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setPromptText("")
    setIsThinking(true)

    try {
      const result = await aiService.generateDiff(text, editor?.model, providerMode)
      const diff = result.diff

      const items: DiffProposalItem[] = []

      if (diff.add?.elements) {
        diff.add.elements.forEach((el) => {
          const prefix = el.stereotype ? el.stereotype : el.type || "Class"
          const details: string[] = []
          if (el.attributes?.length) {
            const attrNames = el.attributes.map((a) => a.name).join(", ")
            details.push(`${el.attributes.length} atributo(s): ${attrNames}`)
          }
          if (el.methods?.length) {
            const methodNames = el.methods.map((m) => m.name).join(", ")
            details.push(`${el.methods.length} método(s): ${methodNames}`)
          }
          const detailStr = details.length ? ` [${details.join(" | ")}]` : ""
          items.push({ type: "add", text: `+ ${prefix} ${el.name}${detailStr}` })
        })
      }
      if (diff.add?.relationships) {
        diff.add.relationships.forEach((rel) => {
          const assocInfo = (rel as { associationClass?: string }).associationClass
            ? ` [Clase Intermedia: ${(rel as { associationClass?: string }).associationClass}]`
            : ""
          items.push({
            type: "add",
            text: `+ ${rel.type}: ${rel.source} -> ${rel.target}${assocInfo}`,
          })
        })
      }
      const existingNodes = editor?.model?.nodes ?? []
      if (diff.modify?.elements) {
        diff.modify.elements.forEach((mod) => {
          const matchedNode = existingNodes.find((n) => {
            const nName =
              typeof (n.data as { name?: string })?.name === "string"
                ? (n.data as { name: string }).name
                : ""
            return n.id === mod.id || (nName && nName.toLowerCase() === mod.id.toLowerCase())
          })
          const nodeName =
            typeof (matchedNode?.data as { name?: string })?.name === "string"
              ? (matchedNode?.data as { name: string }).name
              : ""
          const displayName = nodeName || mod.id
          const detailParts: string[] = []
          if (mod.changes.attributes?.length) {
            detailParts.push(`${mod.changes.attributes.length} atributo(s)`)
          }
          if (mod.changes.methods?.length) {
            detailParts.push(`${mod.changes.methods.length} método(s)`)
          }
          const remAttrs =
            mod.changes.removeAttributes ??
            ((mod.changes as Record<string, unknown>).remove_attributes as string[] | undefined)
          if (remAttrs?.length) {
            detailParts.push(`-${remAttrs.length} atributo(s)`)
          }
          const remMethods =
            mod.changes.removeMethods ??
            ((mod.changes as Record<string, unknown>).remove_methods as string[] | undefined)
          if (remMethods?.length) {
            detailParts.push(`-${remMethods.length} método(s)`)
          }
          const detail = detailParts.length ? `: ${detailParts.join(", ")}` : ""
          items.push({
            type: "mod",
            text: `~ Modificar clase ${displayName}${detail}`,
          })
        })
      }
      const remElements =
        diff.remove?.elementIds ??
        ((diff.remove as Record<string, unknown> | undefined)?.element_ids as string[] | undefined)
      if (remElements?.length) {
        remElements.forEach((id) => {
          const matchedNode = existingNodes.find((n) => {
            const nName =
              typeof (n.data as { name?: string })?.name === "string"
                ? (n.data as { name: string }).name
                : ""
            return n.id === id || (nName && nName.toLowerCase() === id.toLowerCase())
          })
          const nodeName =
            typeof (matchedNode?.data as { name?: string })?.name === "string"
              ? (matchedNode?.data as { name: string }).name
              : ""
          const displayName = nodeName || id
          items.push({ type: "del", text: `- Eliminar clase (${displayName})` })
        })
      }
      const remRels =
        diff.remove?.relationshipIds ??
        ((diff.remove as Record<string, unknown> | undefined)?.relationship_ids as
          | string[]
          | undefined)
      if (remRels?.length) {
        remRels.forEach((id) => {
          items.push({ type: "del", text: `- Eliminar relación (${id})` })
        })
      }

      const agentResponse: ChatMessage = {
        id: `a-${Date.now()}`,
        sender: "agent",
        text: result.message,
        diffProposal:
          items.length > 0
            ? {
                title: "Propuesta de Cambios UML",
                items,
                rawDiff: diff,
              }
            : undefined,
      }

      setMessages((prev) => [...prev, agentResponse])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "agent",
        text: `Error al procesar la solicitud: ${err instanceof Error ? err.message : String(err)}`,
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsThinking(false)
    }
  }

  const handleApplyDiff = (msgId: string) => {
    if (isReadonly) {
      toast.warn("No puedes aplicar cambios en modo Lector (permiso de solo lectura).")
      return
    }

    const targetMsg = messages.find((m) => m.id === msgId)
    if (!targetMsg?.diffProposal?.rawDiff) {
      toast.info("No hay cambios pendientes de aplicar.")
      return
    }

    if (editor) {
      try {
        const currentModel = editor.model
        const updatedModel = applyDiff(currentModel, targetMsg.diffProposal.rawDiff)
        // eslint-disable-next-line react-hooks/immutability
        editor.model = updatedModel

        // Highlight and focus the affected element on canvas
        const diff = targetMsg.diffProposal.rawDiff
        const targetIdOrName = diff.modify?.elements?.[0]?.id || diff.add?.elements?.[0]?.name

        if (targetIdOrName && typeof editor.revealAssessment === "function") {
          const matched = updatedModel.nodes.find(
            (n) =>
              n.id === targetIdOrName ||
              n.data.name === targetIdOrName ||
              (typeof n.data.name === "string" &&
                n.data.name.toLowerCase() === targetIdOrName.toLowerCase()) ||
              n.id.toLowerCase().includes(targetIdOrName.toLowerCase())
          )
          if (matched) {
            editor.revealAssessment(matched.id, { reveal: false })
          }
        } else if (diff.remove?.elementIds?.length || diff.remove?.relationshipIds?.length) {
          if (typeof editor.revealAssessment === "function") {
            editor.revealAssessment(null)
          }
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId && msg.diffProposal
              ? {
                  ...msg,
                  diffProposal: { ...msg.diffProposal, applied: true },
                }
              : msg
          )
        )

        toast.success("Estructura UML validada y sincronizada en el lienzo.", {
          autoClose: 3000,
        })
      } catch (err) {
        toast.error(
          `Error al sincronizar diff: ${err instanceof Error ? err.message : "Error desconocido"}`
        )
      }
    } else {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId && msg.diffProposal
            ? {
                ...msg,
                diffProposal: { ...msg.diffProposal, applied: true },
              }
            : msg
        )
      )
      toast.success("Propuesta registrada correctamente.")
    }
  }

  const handleDiscardDiff = (msgId: string) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === msgId ? { ...msg, diffProposal: undefined } : msg))
    )
    toast.info("Propuesta de diff descartada.")
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* BARRA DE ESTADO Y MODO DE IA */}
      <div className="flex flex-col border-b border-border-subtle/50 bg-surface-subtle/30 px-3 py-1.5 text-[11px] shrink-0 gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-secondary-foreground">
            <SparklesIcon className="size-3.5 text-(--umlstudio-primary)" />
            <span>Copiloto de Modelado IA</span>
          </div>
          <div className="flex items-center gap-1">
            {isReadonly ? (
              <span
                className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--umlstudio-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--umlstudio-warning)_12%,transparent)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-(--umlstudio-warning)"
                title="Modo Lector: Permiso de sólo visualización sin capacidad de mutar el canvas."
              >
                <EyeIcon className="size-3" />
                <span>Lector</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--umlstudio-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--umlstudio-success)_10%,transparent)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-(--umlstudio-success)"
                title="Modo Editor: Permiso pleno para modelar y sincronizar con el lienzo."
              >
                <span className="size-1.5 rounded-full bg-(--umlstudio-success)" />
                <span>Editor</span>
              </span>
            )}
          </div>
        </div>

        {/* SELECTOR DE MODO DE INFERENCIA (AUTO, LOCAL, CLOUD) */}
        <div className="flex items-center justify-between pt-1 border-t border-border-subtle/40">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Modo:
          </span>
          <div className="inline-flex rounded-md border border-border-subtle bg-surface-raised p-0.5 text-[10.5px]">
            {(
              [
                { id: "auto", label: "Auto" },
                { id: "local", label: "Local" },
                { id: "cloud", label: "Cloud" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleModeChange(opt.id)}
                className={`rounded px-2 py-0.5 font-medium transition-all ${
                  providerMode === opt.id
                    ? "bg-(--umlstudio-primary) text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={
                  opt.id === "auto"
                    ? "Cascada automática: Cloudflare -> OpenRouter -> Gemini -> LM Studio -> Ollama"
                    : opt.id === "local"
                      ? "Prioriza modelos locales de tu laptop: LM Studio (:1234) -> Ollama (:11434)"
                      : "Utiliza sólo modelos cloud remotos: Cloudflare -> OpenRouter -> Gemini"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isReadonly && (
        <div className="flex items-start gap-1.5 border-b border-border-subtle/40 bg-[color-mix(in_srgb,var(--umlstudio-warning)_8%,transparent)] px-3 py-1.5 text-[10.5px] text-secondary-foreground shrink-0">
          <LockIcon className="size-3 shrink-0 text-(--umlstudio-warning) mt-0.5" />
          <span>
            Conectado en <strong>Modo Lector</strong>. Podés interactuar con el Copiloto IA por
            texto o voz, pero la aplicación de cambios al lienzo está deshabilitada.
          </span>
        </div>
      )}

      {/* STREAM DE MENSAJES */}
      <div className="workbench-chat-stream flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-secondary-foreground">
            <div className="mb-2.5 flex size-10 items-center justify-center rounded-full border border-border-subtle/60 bg-surface-raised">
              <SparklesIcon className="size-5 text-(--umlstudio-primary)" />
            </div>
            <h4 className="text-xs font-semibold text-(--home-text-primary)">
              Asistente de Modelado UML
            </h4>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              Escribe una instrucción en lenguaje natural o utiliza el micrófono para crear clases,
              atributos, métodos o relaciones en el diagrama.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={msg.sender === "user" ? "user-bubble" : "agent-bubble"}>
              {msg.sender === "agent" && (
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-(--dodger-blue)">
                  <SparklesIcon className="size-3.5 text-(--dodger-blue)" />
                  <span className="tracking-tight">UmlStudio Copilot</span>
                </div>
              )}
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-(--home-text-primary)">
                {msg.text}
              </p>

              {/* TARJETA DE DIFF PROPUESTO (PREVIEW CROMÁTICO OMG UML 2.5) */}
              {msg.diffProposal && (
                <div className="agent-diff-card mt-2.5 rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-md">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-(--home-text-primary) tracking-tight">
                      {msg.diffProposal.title}
                    </span>
                    <span className="rounded border border-(--umlstudio-primary)/40 bg-(--umlstudio-primary)/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-(--umlstudio-primary)">
                      OMG UML 2.5
                    </span>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    {msg.diffProposal.items.map((item) => (
                      <div
                        key={`${item.type}-${item.text}`}
                        className={`rounded px-2 py-1 font-mono text-[11px] font-medium leading-tight ${
                          item.type === "add"
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : item.type === "del"
                              ? "border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                              : "border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {msg.diffProposal.applied ? (
                      <div className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircleIcon className="size-3.5 text-emerald-500" />
                        <span>{t.agent.diffApply} (OK)</span>
                      </div>
                    ) : isReadonly ? (
                      <div
                        className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border-subtle bg-surface-subtle px-2.5 py-1 text-xs text-muted-foreground"
                        title="Acción bloqueada en modo Lector"
                      >
                        <LockIcon className="size-3.5 text-(--umlstudio-warning)" />
                        <span>Aplicación bloqueada en modo Lector</span>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApplyDiff(msg.id)}
                          className="flex-1 rounded-md bg-(--dodger-blue) hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
                        >
                          {t.agent.diffApply}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardDiff(msg.id)}
                          aria-label={t.agent.diffDiscard}
                          className="rounded-md border border-border-subtle bg-surface-subtle hover:bg-surface-raised px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <XCircleIcon className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {isThinking && (
          <div className="agent-bubble flex items-center gap-2 text-xs text-secondary-foreground">
            <SparklesIcon className="size-3.5 animate-pulse text-(--umlstudio-accent)" />
            <span>Analizando instrucción y metamodelo...</span>
          </div>
        )}
      </div>

      {/* CONTENEDOR DE ENTRADA (PROMPT & VOZ) */}
      <div className="agent-prompt-container shrink-0">
        <div className="agent-input-row">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendPrompt()}
            placeholder={
              isListening ? "Escuchando voz..." : "Describe el cambio o clase a modelar..."
            }
            className={`agent-input-field ${
              isListening
                ? "border-destructive bg-[color-mix(in_srgb,var(--umlstudio-danger)_10%,transparent)]"
                : ""
            }`}
          />

          {/* BOTÓN DE VOZ / MICRÓFONO */}
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              title={
                isListening ? "Detener dictado por voz" : "Iniciar dictado por voz (Speech-to-Text)"
              }
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                isListening
                  ? "animate-pulse bg-destructive text-white"
                  : "border border-border-subtle bg-surface-raised text-secondary-foreground hover:text-(--home-text-primary)"
              }`}
            >
              {isListening ? <MicOffIcon className="size-3.5" /> : <MicIcon className="size-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSendPrompt()}
            disabled={!promptText.trim() || isThinking}
            aria-label={t.agent.send}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-(--umlstudio-primary) text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <SendIcon className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
