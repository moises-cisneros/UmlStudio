import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type FormEvent,
} from "react"
import {
  MicIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react"
import type { ModelDiff, RoomAiIntent, RoomAiPolicy, RoomChatMessage } from "@umlstudio/core"
import { useTranslation } from "@/i18n"
import type { RoomAiStatusState } from "@/queries/roomAiCache"
import { formatElapsed, type VoiceRecorderStatus } from "@/hooks/useVoiceRecorder"
import { RoomAiSettingsDialog } from "./RoomAiSettingsDialog"
import { RoomAiPreferencesDialog } from "./RoomAiPreferencesDialog"

function resolveDraftSubmission(
  rawDraft: string,
  selectedIntent: RoomAiIntent,
  allowChanges: boolean
): { text: string; intent: RoomAiIntent } {
  return { text: rawDraft.trim(), intent: allowChanges ? selectedIntent : "ask" }
}

const STREAM_CHARACTERS_PER_FRAME = 3

function useProgressiveStreamText(messages: RoomChatMessage[]): Record<string, string> {
  const [visibleText, setVisibleText] = useState<Record<string, string>>({})
  const visibleTextRef = useRef<Record<string, string>>({})
  const pendingTextRef = useRef(new Map<string, string>())
  const animationFrameRef = useRef<number | null>(null)

  const scheduleFrame = useCallback(() => {
    if (animationFrameRef.current !== null) return
    const runFrame = () => {
      animationFrameRef.current = null
      let changed = false
      for (const [id, pending] of pendingTextRef.current) {
        const next = pending.slice(0, STREAM_CHARACTERS_PER_FRAME)
        const remaining = pending.slice(STREAM_CHARACTERS_PER_FRAME)
        visibleTextRef.current[id] = `${visibleTextRef.current[id] ?? ""}${next}`
        if (remaining) pendingTextRef.current.set(id, remaining)
        else pendingTextRef.current.delete(id)
        changed = true
      }
      if (changed) setVisibleText({ ...visibleTextRef.current })
      if (pendingTextRef.current.size > 0)
        animationFrameRef.current = requestAnimationFrame(runFrame)
    }
    animationFrameRef.current = requestAnimationFrame(runFrame)
  }, [])

  useEffect(() => {
    const activeStreamIds = new Set<string>()
    for (const message of messages) {
      if (!message.id.startsWith("stream:")) continue
      activeStreamIds.add(message.id)
      const visible = visibleTextRef.current[message.id] ?? ""
      if (!message.text.startsWith(visible)) {
        visibleTextRef.current[message.id] = ""
        if (message.text) pendingTextRef.current.set(message.id, message.text)
        else pendingTextRef.current.delete(message.id)
      } else {
        const pending = message.text.slice(visible.length)
        if (pending) pendingTextRef.current.set(message.id, pending)
        else pendingTextRef.current.delete(message.id)
      }
    }
    for (const id of Object.keys(visibleTextRef.current)) {
      if (!activeStreamIds.has(id)) delete visibleTextRef.current[id]
    }
    for (const id of pendingTextRef.current.keys()) {
      if (!activeStreamIds.has(id)) pendingTextRef.current.delete(id)
    }
    if (pendingTextRef.current.size > 0) scheduleFrame()
  }, [messages, scheduleFrame])

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    },
    []
  )

  return visibleText
}

type ProposalItem = { type: "add" | "mod" | "del"; text: string }

function buildProposalItems(
  diff: ModelDiff,
  labels: {
    proposalAddElement: (name: string, type: string) => string
    proposalAddRelationship: (type: string, source: string, target: string) => string
    proposalModifyElement: (id: string) => string
    proposalRenameElement: (id: string, name: string) => string
    proposalSetElementStereotype: (id: string, stereotype: string) => string
    proposalSetElementAttribute: (id: string, name: string) => string
    proposalRemoveElementAttribute: (id: string, name: string) => string
    proposalClearElementAttributes: (id: string) => string
    proposalSetElementMethod: (id: string, name: string) => string
    proposalRemoveElementMethod: (id: string, name: string) => string
    proposalClearElementMethods: (id: string) => string
    proposalMoveElement: (id: string, x: number, y: number) => string
    proposalModifyRelationship: (id: string) => string
    proposalRemoveElement: (id: string) => string
    proposalRemoveRelationship: (id: string) => string
  }
): ProposalItem[] {
  return [
    ...(diff.add?.elements ?? []).map((element) => ({
      type: "add" as const,
      text: labels.proposalAddElement(element.name, element.stereotype ?? element.type ?? "Class"),
    })),
    ...(diff.add?.relationships ?? []).map((relationship) => ({
      type: "add" as const,
      text: labels.proposalAddRelationship(
        relationship.type,
        relationship.source,
        relationship.target
      ),
    })),
    ...(diff.modify?.elements ?? []).flatMap((element) => {
      const { changes } = element
      const items: ProposalItem[] = []

      if (changes.name) {
        items.push({ type: "mod", text: labels.proposalRenameElement(element.id, changes.name) })
      }
      if (changes.stereotype) {
        items.push({
          type: "mod",
          text: labels.proposalSetElementStereotype(element.id, changes.stereotype),
        })
      }
      if (changes.removeAttributes?.length) {
        items.push(
          ...changes.removeAttributes.map((name) => ({
            type: "mod" as const,
            text: labels.proposalRemoveElementAttribute(element.id, name),
          }))
        )
      }
      if (changes.attributes) {
        items.push(
          ...(changes.attributes.length === 0
            ? [{ type: "mod" as const, text: labels.proposalClearElementAttributes(element.id) }]
            : changes.attributes.map((attribute) => ({
                type: "mod" as const,
                text: labels.proposalSetElementAttribute(element.id, attribute.name),
              })))
        )
      }
      if (changes.removeMethods?.length) {
        items.push(
          ...changes.removeMethods.map((name) => ({
            type: "mod" as const,
            text: labels.proposalRemoveElementMethod(element.id, name),
          }))
        )
      }
      if (changes.methods) {
        items.push(
          ...(changes.methods.length === 0
            ? [{ type: "mod" as const, text: labels.proposalClearElementMethods(element.id) }]
            : changes.methods.map((method) => ({
                type: "mod" as const,
                text: labels.proposalSetElementMethod(element.id, method.name),
              })))
        )
      }
      if (changes.position) {
        items.push({
          type: "mod",
          text: labels.proposalMoveElement(element.id, changes.position.x, changes.position.y),
        })
      }

      return items.length > 0
        ? items
        : [{ type: "mod" as const, text: labels.proposalModifyElement(element.id) }]
    }),
    ...(diff.modify?.relationships ?? []).map((relationship) => ({
      type: "mod" as const,
      text: labels.proposalModifyRelationship(relationship.id ?? "relationship"),
    })),
    ...(diff.remove?.elementIds ?? []).map((id) => ({
      type: "del" as const,
      text: labels.proposalRemoveElement(id),
    })),
    ...(diff.remove?.relationshipIds ?? []).map((id) => ({
      type: "del" as const,
      text: labels.proposalRemoveRelationship(id),
    })),
  ]
}

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
  policy?: RoomAiPolicy
  allowChanges?: boolean
  canConfigurePolicy?: boolean
  isUpdatingPolicy?: boolean
  isLoading?: boolean
  hasLoadError?: boolean
  sendErrorKind?: "generic" | "queueFull" | "roomAiDisabled" | "roomAiChangesDisabled" | null
  hasProfileSyncError?: boolean
  hasVoiceError?: boolean
  isSending?: boolean
  onSend: (text: string, intent: RoomAiIntent) => void
  onApplyProposal?: (messageId: string) => void
  onRejectProposal?: (messageId: string) => void
  proposalBusyId?: string | null
  onPolicyChange?: (policy: RoomAiPolicy) => Promise<unknown>
  preferences?: string[]
  onSavePreferences?: (preferences: string[]) => Promise<void>
  voiceControls?: RoomVoiceControls
}

export const RoomChatPanel: FC<RoomChatPanelProps> = ({
  messages,
  aiStatus,
  currentUserId,
  policy,
  allowChanges = true,
  canConfigurePolicy = false,
  isUpdatingPolicy = false,
  isLoading = false,
  hasLoadError = false,
  sendErrorKind = null,
  hasProfileSyncError = false,
  hasVoiceError = false,
  isSending = false,
  onSend,
  onApplyProposal,
  onRejectProposal,
  proposalBusyId = null,
  onPolicyChange,
  preferences = [],
  onSavePreferences,
  voiceControls,
}) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const [selectedIntent, setSelectedIntent] = useState<RoomAiIntent>("ask")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const messageListRef = useRef<HTMLOListElement>(null)
  const didScrollInitialHistoryRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const byId = new Map(messages.map((m) => [m.id, m]))
  const progressiveStreamText = useProgressiveStreamText(messages)
  const resolved = resolveDraftSubmission(draft, selectedIntent, allowChanges)
  const effectiveIntent = resolved.intent

  const selectAskIntent = () => {
    setSelectedIntent("ask")
  }

  const selectChangeIntent = () => {
    if (!allowChanges) return
    setSelectedIntent("change")
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!resolved.text || isSending) return
    onSend(resolved.text, effectiveIntent)
    setDraft("")
  }

  const updateStickToBottom = () => {
    const list = messageListRef.current
    if (!list) return
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 32
  }

  useLayoutEffect(() => {
    const list = messageListRef.current
    if (!list) return
    if (!didScrollInitialHistoryRef.current) {
      if (isLoading) return
      didScrollInitialHistoryRef.current = true
      stickToBottomRef.current = true
    }
    if (stickToBottomRef.current) list.scrollTop = list.scrollHeight
  }, [isLoading, messages, progressiveStreamText])

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
        ref={messageListRef}
        data-testid="room-ai-message-list"
        onScroll={updateStickToBottom}
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
          const isStreamedReply = message.id.startsWith("stream:")
          const text = isStreamedReply ? (progressiveStreamText[message.id] ?? "") : message.text
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
                {!message.proposal && (
                  <p
                    {...(isStreamedReply ? { "data-testid": "room-ai-stream-text" } : {})}
                    className="break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground"
                  >
                    {text}
                  </p>
                )}
                {message.proposal && (
                  <div className="agent-diff-card mt-2 rounded-lg border border-border-subtle bg-surface-raised p-2 shadow-md">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold tracking-tight text-foreground">
                        {t.roomAi.changeProposal}
                      </p>
                      <span className="rounded border border-(--umlstudio-primary)/40 bg-(--umlstudio-primary)/15 px-1 py-px font-mono text-[9px] font-semibold text-(--umlstudio-primary)">
                        UML 2.5
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1 font-mono text-[10px]">
                      {buildProposalItems(message.proposal.diff, t.roomAi).map((item) => (
                        <div
                          key={`${item.type}-${item.text}`}
                          className={`rounded px-1.5 py-0.5 font-medium leading-tight ${
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
                    {message.proposal.status === "pending" && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onApplyProposal?.(message.id)}
                          disabled={!onApplyProposal || proposalBusyId !== null}
                          className="rounded bg-(--umlstudio-primary) px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
                        >
                          {proposalBusyId === message.id
                            ? t.roomAi.applyingProposal
                            : t.roomAi.applyProposal}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectProposal?.(message.id)}
                          disabled={!onRejectProposal || proposalBusyId !== null}
                          className="rounded border border-border-subtle px-2 py-1 text-[10px] text-muted-foreground disabled:opacity-50"
                        >
                          {t.roomAi.rejectProposal}
                        </button>
                      </div>
                    )}
                    {message.proposal.status !== "pending" && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        {message.proposal.status === "applied" && message.proposal.completedBy
                          ? t.roomAi.proposalAppliedBy(message.proposal.completedBy.name)
                          : message.proposal.status === "applied"
                            ? t.roomAi.proposalApplied
                            : message.proposal.status === "rejected"
                              ? t.roomAi.proposalRejected
                              : message.proposal.status === "failed"
                                ? t.roomAi.proposalFailed
                                : message.proposal.status === "stale"
                                  ? t.roomAi.proposalStale
                                  : t.roomAi.proposalClaimed}
                      </p>
                    )}
                  </div>
                )}
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
        {sendErrorKind && (
          <p
            role="alert"
            className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive"
          >
            {sendErrorKind === "queueFull"
              ? t.roomAi.queueFullError
              : sendErrorKind === "roomAiDisabled"
                ? t.roomAi.roomAiDisabledError
                : sendErrorKind === "roomAiChangesDisabled"
                  ? t.roomAi.roomAiChangesDisabledError
                  : t.roomAi.sendError}
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
            className={
              (voiceControls.status === "idle" ||
                (voiceControls.status === "recorded" && !voiceControls.audioUrl)) &&
              !hasVoiceError
                ? "hidden"
                : "mb-2 flex min-w-0 items-center gap-1.5"
            }
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
            ) : null}
          </div>
        )}
        <div
          role="group"
          aria-label={t.roomAi.intentModeLabel}
          className="mb-1.5 flex items-center justify-between gap-1.5"
        >
          <div className="inline-flex items-center gap-1 rounded-md border border-border-subtle/70 bg-surface-raised p-0.5">
            <button
              type="button"
              aria-pressed={effectiveIntent === "ask"}
              onClick={selectAskIntent}
              disabled={isSending}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                effectiveIntent === "ask"
                  ? "bg-(--umlstudio-primary) text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.roomAi.askIntent}
            </button>
            <button
              type="button"
              aria-pressed={effectiveIntent === "change"}
              onClick={selectChangeIntent}
              disabled={!allowChanges || isSending}
              title={!allowChanges ? t.roomAi.mentorOnlyHint : undefined}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                effectiveIntent === "change"
                  ? "bg-(--umlstudio-primary) text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.roomAi.changeIntent}
            </button>
          </div>
        </div>
        {canConfigurePolicy && policy && onPolicyChange && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            disabled={isUpdatingPolicy}
            aria-label={t.roomAi.settingsButton}
            className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SettingsIcon className="size-3" aria-hidden />
            {t.roomAi.settingsButton}
          </button>
        )}
        {onSavePreferences && !(canConfigurePolicy && policy && onPolicyChange) && (
          <button
            type="button"
            onClick={() => setPreferencesOpen(true)}
            className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <SettingsIcon className="size-3" aria-hidden />
            {t.roomAi.preferencesButton}
          </button>
        )}
        <form
          onSubmit={submit}
          className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised p-1.5 shadow-sm"
        >
          <input
            value={draft}
            onChange={(e) => {
              const nextDraft = e.target.value
              setDraft(nextDraft)
            }}
            placeholder={t.roomAi.inputPlaceholder}
            aria-label={t.roomAi.inputPlaceholder}
            className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {voiceControls &&
            voiceControls.status !== "recording" &&
            !(voiceControls.status === "recorded" && voiceControls.audioUrl) && (
              <button
                type="button"
                onClick={voiceControls.onStartRecording}
                disabled={!voiceControls.hasSupport || voiceControls.isSending || isSending}
                aria-label={t.roomAi.recordVoice}
                title={voiceControls.hasSupport ? t.roomAi.recordVoice : t.roomAi.voiceUnavailable}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-raised text-secondary-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MicIcon className="size-3.5" aria-hidden />
              </button>
            )}
          <button
            type="submit"
            disabled={!resolved.text || isSending}
            aria-label={t.roomAi.send}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--umlstudio-primary) text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="size-3.5" aria-hidden />
          </button>
        </form>
      </div>
      {canConfigurePolicy && policy && onPolicyChange && (
        <RoomAiSettingsDialog
          open={settingsOpen}
          policy={policy}
          isSaving={isUpdatingPolicy}
          onOpenChange={setSettingsOpen}
          onSave={onPolicyChange}
          preferences={preferences}
          onSavePreferences={onSavePreferences}
        />
      )}
      {onSavePreferences && (
        <RoomAiPreferencesDialog
          open={preferencesOpen}
          preferences={preferences}
          onOpenChange={setPreferencesOpen}
          onSave={onSavePreferences}
        />
      )}
    </section>
  )
}
