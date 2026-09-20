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
      const result = await aiService.generateDiff(text, editor?.model)
      const diff = result.diff

      const items: DiffProposalItem[] = []

      if (diff.add?.elements) {
        diff.add.elements.forEach((el) => {
          const prefix = el.stereotype ? el.stereotype : el.type || "Class"
          items.push({ type: "add", text: `+ ${prefix} ${el.name}` })
        })
      }
      if (diff.add?.relationships) {
        diff.add.relationships.forEach((rel) => {
          items.push({
            type: "add",
            text: `+ ${rel.type}: ${rel.source} -> ${rel.target}`,
          })
        })
      }
      if (diff.modify?.elements) {
        diff.modify.elements.forEach((mod) => {
          items.push({
            type: "mod",
            text: `~ Modificar elemento (${mod.id})`,
          })
        })
      }
      if (diff.remove?.elementIds) {
        diff.remove.elementIds.forEach((id) => {
          items.push({ type: "del", text: `- Eliminar elemento (${id})` })
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
      {/* BARRA DE ESTADO Y PERMISOS */}
      <div className="flex items-center justify-between border-b border-border-subtle/50 bg-surface-subtle/30 px-3 py-1.5 text-[11px] shrink-0">
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
              <span>Lector (Sólo lectura)</span>
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
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-(--umlstudio-accent)">
                  <SparklesIcon className="size-3 text-(--umlstudio-accent)" />
                  <span>UmlStudio Copilot</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* TARJETA DE DIFF PROPUESTO (PREVIEW CROMÁTICO OMG UML 2.5) */}
              {msg.diffProposal && (
                <div className="agent-diff-card mt-2">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-(--baby-blue-ice)">
                    <span>{msg.diffProposal.title}</span>
                    <span className="text-[10px] text-(--umlstudio-primary)">OMG UML 2.5</span>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    {msg.diffProposal.items.map((item) => (
                      <div
                        key={`${item.type}-${item.text}`}
                        className={`rounded px-1.5 py-0.5 ${
                          item.type === "add"
                            ? "bg-[color-mix(in_srgb,var(--umlstudio-success)_15%,transparent)] text-(--umlstudio-success)"
                            : item.type === "del"
                              ? "bg-[color-mix(in_srgb,var(--umlstudio-danger)_15%,transparent)] text-(--umlstudio-danger)"
                              : "bg-[color-mix(in_srgb,var(--umlstudio-primary)_15%,transparent)] text-(--umlstudio-accent)"
                        }`}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {msg.diffProposal.applied ? (
                      <div className="flex items-center gap-1 text-xs font-medium text-(--umlstudio-success)">
                        <CheckCircleIcon className="size-3.5" />
                        <span>{t.agent.diffApply} (OK)</span>
                      </div>
                    ) : isReadonly ? (
                      <div
                        className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-muted-foreground"
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
                          className="flex-1 rounded bg-(--umlstudio-primary) px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        >
                          {t.agent.diffApply}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardDiff(msg.id)}
                          aria-label={t.agent.diffDiscard}
                          className="rounded border border-border-subtle bg-transparent px-2 py-1 text-xs text-secondary-foreground hover:text-(--home-text-primary)"
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
                ? "border-(--umlstudio-danger) bg-[color-mix(in_srgb,var(--umlstudio-danger)_10%,transparent)]"
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
                  ? "animate-pulse bg-(--umlstudio-danger) text-white"
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
