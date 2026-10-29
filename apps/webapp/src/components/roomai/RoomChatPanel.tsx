import { useState, type FC, type FormEvent } from "react"
import { MicIcon, SendIcon, SparklesIcon, SquareIcon, XCircleIcon } from "lucide-react"
import type { RoomChatMessage } from "@umlstudio/core"
import { useTranslation } from "@/i18n"
import type { RoomAiStatusState } from "@/queries/roomAiCache"
import { formatElapsed, type VoiceRecorderStatus } from "@/hooks/useVoiceRecorder"

export interface RoomVoiceControls {
  status: VoiceRecorderStatus
  elapsed: number
  audioUrl: string | null
  hasSupport: boolean
  isSending: boolean
  hasError: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onCancelRecording: () => void
  onSendRecording: () => void
}

export interface RoomChatPanelProps {
  messages: RoomChatMessage[]
  aiStatus: RoomAiStatusState
  currentUserId?: string
  isLoading?: boolean
  hasLoadError?: boolean
  hasSendError?: boolean
  hasProfileSyncError?: boolean
  hasVoiceError?: boolean
  isSending?: boolean
  onSend: (text: string) => void
  voiceControls?: RoomVoiceControls
}

export const RoomChatPanel: FC<RoomChatPanelProps> = ({
  messages,
  aiStatus,
  currentUserId,
  isLoading = false,
  hasLoadError = false,
  hasSendError = false,
  hasProfileSyncError = false,
  hasVoiceError = false,
  isSending = false,
  onSend,
  voiceControls,
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
    <section className="flex h-full min-h-0 flex-col overflow-hidden" aria-label={t.roomAi.title}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle/50 bg-surface-subtle/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border-subtle/60 bg-surface-raised">
            <SparklesIcon className="size-3.5 text-(--umlstudio-primary)" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold text-foreground">{t.roomAi.title}</h2>
            <p className="text-[10px] text-muted-foreground">{t.roomAi.sharedConversation}</p>
          </div>
        </div>
        {aiStatus.status === "thinking" && (
          <span
            role="status"
            className="flex shrink-0 items-center gap-1 text-[10px] text-secondary-foreground"
          >
            <SparklesIcon className="size-3 animate-pulse text-(--umlstudio-primary)" aria-hidden />
            <span className="max-w-28 truncate">
              {aiStatus.forUserName
                ? t.roomAi.thinkingFor(aiStatus.forUserName)
                : t.roomAi.thinking}
              {aiStatus.queueLength > 0 && ` · ${t.roomAi.queueLength(aiStatus.queueLength)}`}
            </span>
          </span>
        )}
      </header>

      <ol
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {isLoading && <li className="text-xs text-muted-foreground">{t.roomAi.loading}</li>}
        {hasLoadError && (
          <li
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
          >
            {t.roomAi.loadError}
          </li>
        )}
        {!isLoading && !hasLoadError && messages.length === 0 && (
          <li className="m-auto flex max-w-52 flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-9 items-center justify-center rounded-full border border-border-subtle/60 bg-surface-raised">
              <SparklesIcon className="size-4 text-(--umlstudio-primary)" aria-hidden />
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">{t.roomAi.empty}</p>
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
              className={`flex min-w-0 ${isMine ? "justify-end" : "justify-start"}`}
            >
              <article
                className={`min-w-0 max-w-[92%] rounded-lg border px-2.5 py-2 shadow-xs ${
                  isAi
                    ? "border-(--umlstudio-primary)/20 bg-surface-raised"
                    : isMine
                      ? "border-border-subtle bg-surface-subtle"
                      : "border-border-subtle/70 bg-surface-subtle/50"
                }`}
              >
                <div
                  className={`mb-1 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold ${isAi ? "text-(--umlstudio-primary)" : "text-secondary-foreground"}`}
                >
                  {isAi ? (
                    <SparklesIcon className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: message.author.color ?? "currentColor" }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{authorName}</span>
                </div>
                {question && (
                  <blockquote className="mb-1.5 break-words border-l-2 border-border-subtle pl-2 text-[10px] leading-relaxed text-muted-foreground">
                    {t.roomAi.replyingTo} {question.author.name}: {question.text}
                  </blockquote>
                )}
                <p className="break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {message.text}
                </p>
                {(message.status === "queued" || message.status === "failed") && (
                  <p
                    className={`mt-1 text-[10px] ${message.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {message.status === "queued" ? (
                      t.roomAi.queued
                    ) : (
                      <span role="alert">{t.roomAi.failed}</span>
                    )}
                  </p>
                )}
              </article>
            </li>
          )
        })}
      </ol>

      <div className="shrink-0 border-t border-border-subtle/60 bg-surface-subtle/30 px-2.5 pb-2.5 pt-2">
        {hasSendError && (
          <p
            role="alert"
            className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
          >
            {t.roomAi.sendError}
          </p>
        )}
        {hasProfileSyncError && (
          <p
            role="alert"
            className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
          >
            {t.roomAi.profileSyncError}
          </p>
        )}
        {voiceControls && (
          <div
            className="mb-2 flex min-w-0 items-center gap-1.5"
            aria-label={t.roomAi.voiceControls}
          >
            {hasVoiceError && (
              <p role="alert" className="min-w-0 flex-1 text-[10px] text-destructive">
                {t.roomAi.voiceError}
              </p>
            )}
            {voiceControls.status === "recording" ? (
              <>
                <span
                  role="status"
                  className="mr-auto min-w-0 truncate text-[10px] text-muted-foreground"
                >
                  {t.roomAi.recording} {formatElapsed(voiceControls.elapsed)}
                </span>
                <button
                  type="button"
                  onClick={voiceControls.onStopRecording}
                  aria-label={t.roomAi.stopRecording}
                  title={t.roomAi.stopRecording}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-destructive px-2 text-[10px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  <SquareIcon className="size-3" aria-hidden />
                  {t.roomAi.stopRecording}
                </button>
                <button
                  type="button"
                  onClick={voiceControls.onCancelRecording}
                  aria-label={t.roomAi.cancelRecording}
                  title={t.roomAi.cancelRecording}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XCircleIcon className="size-3.5" aria-hidden />
                </button>
              </>
            ) : voiceControls.status === "recorded" && voiceControls.audioUrl ? (
              <>
                <audio
                  src={voiceControls.audioUrl}
                  controls
                  className="h-8 min-w-0 flex-1"
                  aria-label={t.roomAi.recordedVoicePreview}
                />
                <button
                  type="button"
                  onClick={voiceControls.onSendRecording}
                  disabled={voiceControls.isSending}
                  aria-label={voiceControls.isSending ? t.roomAi.sendingVoice : t.roomAi.sendVoice}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-(--umlstudio-primary) px-2 text-[10px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <SendIcon className="size-3" aria-hidden />
                  <span className="hidden sm:inline">
                    {voiceControls.isSending ? t.roomAi.sendingVoice : t.roomAi.sendVoice}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={voiceControls.onCancelRecording}
                  disabled={voiceControls.isSending}
                  aria-label={t.roomAi.cancelRecording}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-raised text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <XCircleIcon className="size-3.5" aria-hidden />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={voiceControls.onStartRecording}
                disabled={!voiceControls.hasSupport || voiceControls.isSending || isSending}
                aria-label={t.roomAi.recordVoice}
                title={voiceControls.hasSupport ? t.roomAi.recordVoice : t.roomAi.voiceUnavailable}
                className="flex h-7 items-center gap-1 rounded-md border border-border-subtle bg-surface-raised px-2 text-[10px] font-medium text-secondary-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MicIcon className="size-3.5" aria-hidden />
                <span>{t.roomAi.recordVoice}</span>
              </button>
            )}
          </div>
        )}
        <form
          onSubmit={submit}
          className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised p-1.5 shadow-sm"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.roomAi.inputPlaceholder}
            aria-label={t.roomAi.inputPlaceholder}
            className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            aria-label={t.roomAi.send}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--umlstudio-primary) text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="size-3.5" aria-hidden />
          </button>
        </form>
      </div>
    </section>
  )
}
