import { useState, type FC, type FormEvent } from "react"
import { SendIcon, SparklesIcon } from "lucide-react"
import type { RoomChatMessage } from "@umlstudio/core"
import { useTranslation } from "@/i18n"
import type { RoomAiStatusState } from "@/queries/roomAiCache"

export interface RoomChatPanelProps {
  messages: RoomChatMessage[]
  aiStatus: RoomAiStatusState
  currentUserId?: string
  isLoading?: boolean
  hasLoadError?: boolean
  hasSendError?: boolean
  isSending?: boolean
  onSend: (text: string) => void
}

export const RoomChatPanel: FC<RoomChatPanelProps> = ({
  messages,
  aiStatus,
  currentUserId,
  isLoading = false,
  hasLoadError = false,
  hasSendError = false,
  isSending = false,
  onSend,
}) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const byId = new Map(messages.map((m) => [m.id, m]))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isSending) return
    onSend(text)
    setDraft("")
  }

  return (
    <section className="flex h-full flex-col" aria-label={t.roomAi.title}>
      <ol className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {isLoading && <li className="text-sm opacity-70">{t.roomAi.loading}</li>}
        {hasLoadError && (
          <li role="alert" className="text-sm text-red-500">
            {t.roomAi.loadError}
          </li>
        )}
        {!isLoading && !hasLoadError && messages.length === 0 && (
          <li className="text-sm opacity-70">{t.roomAi.empty}</li>
        )}
        {messages.map((message) => {
          const isAi = message.author.kind === "ai"
          const isMine = !isAi && message.author.id === currentUserId
          const question = message.replyTo ? byId.get(message.replyTo) : undefined
          const authorName = isAi ? t.roomAi.aiAuthor : isMine ? t.roomAi.you : message.author.name
          return (
            <li
              key={message.id}
              data-testid="room-ai-message"
              data-author-kind={message.author.kind}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {isAi ? (
                  <SparklesIcon className="size-3.5" aria-hidden />
                ) : (
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: message.author.color ?? "currentColor" }}
                    aria-hidden
                  />
                )}
                <span>{authorName}</span>
              </div>
              {question && (
                <blockquote className="mt-1 border-l-2 pl-2 text-xs opacity-70">
                  {t.roomAi.replyingTo} {question.author.name}: {question.text}
                </blockquote>
              )}
              <p className="mt-1 text-sm whitespace-pre-wrap">{message.text}</p>
              {message.status === "queued" && !isAi && (
                <span className="text-xs opacity-60">{t.roomAi.queued}</span>
              )}
              {message.status === "failed" && (
                <span role="alert" className="text-xs text-red-500">
                  {t.roomAi.failed}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {aiStatus.status === "thinking" && (
        <p role="status" className="flex items-center gap-1.5 px-3 pb-2 text-xs">
          <SparklesIcon className="size-3.5 animate-pulse" aria-hidden />
          <span>
            {aiStatus.forUserName ? t.roomAi.thinkingFor(aiStatus.forUserName) : t.roomAi.thinking}
            {aiStatus.queueLength > 0 && ` · ${t.roomAi.queueLength(aiStatus.queueLength)}`}
          </span>
        </p>
      )}

      {hasSendError && (
        <p role="alert" className="px-3 pb-2 text-xs text-red-500">
          {t.roomAi.sendError}
        </p>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.roomAi.inputPlaceholder}
          aria-label={t.roomAi.inputPlaceholder}
          className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label={t.roomAi.send}
          className="flex items-center justify-center rounded px-2 disabled:opacity-50"
        >
          <SendIcon className="size-4" />
        </button>
      </form>
    </section>
  )
}
