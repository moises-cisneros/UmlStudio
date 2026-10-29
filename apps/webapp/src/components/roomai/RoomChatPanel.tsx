import { useState, type FC, type FormEvent } from "react"
import { SendIcon, SparklesIcon } from "lucide-react"
import type { RoomChatMessage } from "@umlstudio/core"
import { useTranslation } from "@/i18n"
import type { RoomAiStatusState } from "@/queries/roomAiCache"
import type { SharedRoomAiMemory } from "@/services/DiagramApiClient"

export interface RoomChatPanelProps {
  messages: RoomChatMessage[]
  mode?: "room" | "private"
  onModeChange?: (mode: "room" | "private") => void
  aiStatus: RoomAiStatusState
  currentUserId?: string
  isLoading?: boolean
  hasLoadError?: boolean
  hasSendError?: boolean
  isSending?: boolean
  onSend: (text: string) => void
  personalMemory?: string
  personalMemoryDisabled?: boolean
  onPersonalMemoryChange?: (value: string) => void
  onSavePersonalMemory?: () => void
  sharedMemory?: SharedRoomAiMemory | null
  hasSharedMemoryError?: boolean
  hasPinError?: boolean
  onPinMessage?: (text: string) => void
}

export const RoomChatPanel: FC<RoomChatPanelProps> = ({
  messages,
  mode = "room",
  onModeChange,
  aiStatus,
  currentUserId,
  isLoading = false,
  hasLoadError = false,
  hasSendError = false,
  isSending = false,
  onSend,
  personalMemory = "",
  personalMemoryDisabled = false,
  onPersonalMemoryChange,
  onSavePersonalMemory,
  sharedMemory,
  hasSharedMemoryError = false,
  hasPinError = false,
  onPinMessage,
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
      <div role="group" aria-label={t.roomAi.modeGroup} className="flex gap-1 border-b px-3 py-2">
        <button
          type="button"
          aria-pressed={mode === "room"}
          onClick={() => onModeChange?.("room")}
          className="rounded px-3 py-1 text-sm"
        >
          {t.roomAi.roomMode}
        </button>
        <button
          type="button"
          aria-pressed={mode === "private"}
          onClick={() => onModeChange?.("private")}
          className="rounded px-3 py-1 text-sm"
        >
          {t.roomAi.privateMode}
        </button>
      </div>
      {mode === "private" && (
        <p className="px-3 pt-2 text-xs opacity-70">{t.roomAi.privateNotice}</p>
      )}
      <ol className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {isLoading && <li className="text-sm opacity-70">{t.roomAi.loading}</li>}
        {hasLoadError && (
          <li role="alert" className="text-sm text-red-500">
            {t.roomAi.loadError}
          </li>
        )}
        {!isLoading && !hasLoadError && messages.length === 0 && (
          <li className="text-sm opacity-70">
            {mode === "private" ? t.roomAi.privateEmpty : t.roomAi.empty}
          </li>
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
              {mode === "room" && onPinMessage && (
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => onPinMessage(message.text)}
                >
                  {t.roomAi.pinMessage}
                </button>
              )}
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

      {mode === "room" && hasPinError && (
        <p role="alert" className="border-t px-3 py-2 text-xs text-red-500">
          {t.roomAi.pinMemoryError}
        </p>
      )}

      {mode === "room" && (sharedMemory || hasSharedMemoryError) && (
        <section className="border-t px-3 py-2 text-xs" aria-label={t.roomAi.sharedSummary}>
          <h3 className="font-medium">{t.roomAi.sharedSummary}</h3>
          {hasSharedMemoryError && (
            <p role="alert" className="mt-1 text-red-500">
              {t.roomAi.sharedMemoryError}
            </p>
          )}
          {sharedMemory?.summary && (
            <p className="mt-1 whitespace-pre-wrap">{sharedMemory.summary}</p>
          )}
          {sharedMemory?.pinnedDecisions.length ? (
            <h4 className="mt-2 font-medium">{t.roomAi.pinnedDecisions}</h4>
          ) : null}
          {sharedMemory?.pinnedDecisions.map((decision) => (
            <p key={decision}>{decision}</p>
          ))}
        </section>
      )}
      {mode === "private" && onPersonalMemoryChange && (
        <section className="border-t p-3">
          <label className="mb-1 block text-xs" htmlFor="room-ai-personal-memory">
            {t.roomAi.personalMemory}
          </label>
          <textarea
            id="room-ai-personal-memory"
            value={personalMemory}
            onChange={(event) => onPersonalMemoryChange(event.target.value)}
            disabled={personalMemoryDisabled}
            className="w-full rounded border bg-transparent p-2 text-xs"
            rows={3}
          />
          <button
            type="button"
            onClick={onSavePersonalMemory}
            disabled={personalMemoryDisabled}
            className="mt-1 rounded border px-2 py-1 text-xs"
          >
            {t.roomAi.saveMemory}
          </button>
        </section>
      )}

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
          placeholder={
            mode === "private" ? t.roomAi.privateInputPlaceholder : t.roomAi.inputPlaceholder
          }
          aria-label={
            mode === "private" ? t.roomAi.privateInputPlaceholder : t.roomAi.inputPlaceholder
          }
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
