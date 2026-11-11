import { useCallback, useEffect, useRef, useState, type FC } from "react"
import {
  applyDiff,
  findTargetEdge,
  findTargetNode,
  type ModelDiff,
  type RoomAiIntent,
  type UMLModel,
} from "@umlstudio/core"
import { useRoomAi } from "@/queries/roomAiQueries"
import { useAuthStore } from "@/stores/useAuthStore"
import { useEditorContext } from "@/contexts"
import { ApiError } from "@/services/DiagramApiClient"
import {
  readPersonalRoomProfile,
  writePersonalRoomProfile,
  type PersonalRoomProfileRecord,
  type PersonalRoomTeachingProfile,
} from "@/services/personalRoomMemory"
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder"
import { voiceFileNameForBlob } from "@/components/agentic/voiceFileName"
import { VisionImportDialog } from "@/components/vision/VisionImportDialog"
import { RoomChatPanel } from "./RoomChatPanel"

const DEFAULT_TEACHING_PROFILE: PersonalRoomTeachingProfile = {
  detailLevel: "balanced",
  exampleStyle: "none",
}

function isDiffApplicable(model: UMLModel, diff: ModelDiff): boolean {
  const elements = model.nodes ?? []
  const relationships = model.edges ?? []
  const addedElementTargets = new Set(
    (diff.add?.elements ?? []).flatMap((element) =>
      [element.id, element.name].filter((value): value is string => typeof value === "string")
    )
  )
  return !(
    diff.modify?.elements?.some((element) => !findTargetNode(elements, element.id)) ||
    diff.remove?.elementIds?.some((id) => !findTargetNode(elements, id)) ||
    diff.modify?.relationships?.some(
      (relationship) =>
        !findTargetEdge(
          relationships,
          elements,
          relationship.id,
          relationship.source,
          relationship.target
        )
    ) ||
    diff.remove?.relationshipIds?.some((id) => !findTargetEdge(relationships, elements, id)) ||
    diff.add?.relationships?.some((relationship) =>
      [relationship.source, relationship.target].some(
        (endpoint) =>
          Boolean(endpoint) &&
          !findTargetNode(elements, endpoint) &&
          !addedElementTargets.has(endpoint)
      )
    )
  )
}

export const RoomChatPanelContainer: FC<{ diagramId: string }> = ({ diagramId }) => {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const scopeKey = JSON.stringify([userId, diagramId])
  return <RoomChatPanelContainerScope key={scopeKey} diagramId={diagramId} />
}

const RoomChatPanelContainerScope: FC<{ diagramId: string }> = ({ diagramId }) => {
  const user = useAuthStore((s) => s.user)
  const { editor, flushSharedReplica } = useEditorContext()
  const flush = useCallback(() => {
    if (!flushSharedReplica) return Promise.reject(new Error("Shared replica is unavailable"))
    return flushSharedReplica()
  }, [flushSharedReplica])
  const room = useRoomAi(diagramId, flush)
  const sendErrorKind = (() => {
    if (room.sendError === null) return null
    if (!(room.sendError instanceof ApiError)) return "generic"

    switch (room.sendError.code) {
      case "ROOM_AI_QUEUE_FULL":
        return "queueFull"
      case "ROOM_AI_DISABLED":
        return "roomAiDisabled"
      case "ROOM_AI_CHANGES_DISABLED":
        return "roomAiChangesDisabled"
      default:
        return "generic"
    }
  })()
  const getPersonalProfileRevision = room.getPersonalProfileRevision
  const [profileRecord, setProfileRecord] = useState<PersonalRoomProfileRecord | null>(null)
  const [profileReady, setProfileReady] = useState(() => !user?.id)
  const [profileStorageAvailable, setProfileStorageAvailable] = useState(true)
  const [profileSyncError, setProfileSyncError] = useState(false)
  const [voiceError, setVoiceError] = useState(false)
  const [visionOpen, setVisionOpen] = useState(false)
  const [visionFile, setVisionFile] = useState<File | null>(null)
  const recorder = useVoiceRecorder({ onError: () => setVoiceError(true) })
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null)
  const autoAttemptedRef = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    if (!user?.id) return () => void (active = false)

    void (async () => {
      try {
        const [storedProfile] = await Promise.all([
          readPersonalRoomProfile(user.id, diagramId),
          getPersonalProfileRevision(),
        ])
        if (active) {
          setProfileRecord(storedProfile)
          setProfileStorageAvailable(true)
          setProfileSyncError(false)
        }
      } catch {
        if (active) {
          setProfileRecord(null)
          setProfileStorageAvailable(false)
          setProfileSyncError(true)
        }
      } finally {
        if (active) setProfileReady(true)
      }
    })()

    return () => {
      active = false
    }
  }, [diagramId, getPersonalProfileRevision, user?.id])

  const getProfileForInteraction = async () => {
    if (!user?.id) return null
    let storageAvailable = profileStorageAvailable
    let storedProfile = profileRecord
    if (!storageAvailable) {
      try {
        storedProfile = await readPersonalRoomProfile(user.id, diagramId)
        storageAvailable = true
        setProfileRecord(storedProfile)
        setProfileStorageAvailable(true)
      } catch {
        setProfileSyncError(true)
        storedProfile = null
      }
    }
    try {
      const revision = await getPersonalProfileRevision()
      const current = storedProfile?.revision === revision ? storedProfile.profile : null
      if (storedProfile && !current) setProfileRecord(null)
      return {
        teachingProfile: current ?? DEFAULT_TEACHING_PROFILE,
        profileRevision: revision,
      }
    } catch {
      setProfileSyncError(true)
      return null
    }
  }

  const applyProfileUpdate = async (
    update: { profile: PersonalRoomTeachingProfile; revision: string } | undefined,
    learningFailed: boolean | undefined,
    profileWasSent: boolean
  ) => {
    if (learningFailed) setProfileSyncError(true)
    if (!update || !user?.id) {
      if (profileWasSent && !learningFailed) setProfileSyncError(false)
      return
    }
    try {
      await writePersonalRoomProfile(user.id, diagramId, update)
      setProfileRecord(update)
      setProfileStorageAvailable(true)
      setProfileSyncError(false)
    } catch {
      // Keep IndexedDB unchanged and do not reuse its profile with a newer revision.
      setProfileRecord(null)
      setProfileSyncError(true)
    }
  }

  const reconcileAfterRequestFailure = async (revision: string | undefined) => {
    if (!user?.id || !revision || !profileStorageAvailable) return
    try {
      const currentRevision = await getPersonalProfileRevision()
      if (currentRevision !== revision) {
        setProfileRecord(null)
        setProfileSyncError(true)
      }
    } catch {
      setProfileSyncError(true)
    }
  }

  const sendQuestion = async (text: string, intent: RoomAiIntent = "ask") => {
    const profile = await getProfileForInteraction()
    try {
      const result = await room.sendMessage({ text, intent, ...(profile ?? {}) })
      await applyProfileUpdate(result.profileUpdate, result.profileLearningFailed, profile !== null)
    } catch (error) {
      await reconcileAfterRequestFailure(profile?.profileRevision)
      throw error
    }
  }

  const sendVoiceQuestion = async () => {
    const file = recorder.audioBlob
    if (!file || room.isSendingVoice) return
    setVoiceError(false)
    const profile = await getProfileForInteraction()
    try {
      const result = await room.sendVoiceMessage({
        file,
        filename: voiceFileNameForBlob(file),
        ...(profile ?? {}),
      })
      await applyProfileUpdate(result.profileUpdate, result.profileLearningFailed, profile !== null)
      recorder.resetRecording()
    } catch {
      await reconcileAfterRequestFailure(profile?.profileRevision)
      setVoiceError(true)
    }
  }

  const savePreferences = async (preferences: string[]) => {
    if (!user?.id) throw new Error("A signed-in user is required")
    const current = await getProfileForInteraction()
    if (!current) throw new Error("Room profile storage is unavailable")
    const profile = { ...current.teachingProfile, preferences }
    await writePersonalRoomProfile(user.id, diagramId, {
      profile,
      revision: current.profileRevision,
    })
    setProfileRecord({ profile, revision: current.profileRevision })
    setProfileStorageAvailable(true)
    setProfileSyncError(false)
  }

  const applyProposal = useCallback(
    async (messageId: string) => {
      if (!editor || editor.isReadonly() || proposalBusyId) return
      setProposalBusyId(messageId)
      try {
        const diff = await room.claimProposal(messageId)
        if (editor.isReadonly()) {
          await room.completeProposal(messageId, "failed").catch(() => undefined)
          return
        }
        if (!isDiffApplicable(editor.model, diff)) {
          await room.completeProposal(messageId, "stale").catch(() => undefined)
          return
        }
        try {
          editor.model = applyDiff(editor.model, diff)
        } catch {
          await room.completeProposal(messageId, "failed").catch(() => undefined)
          return
        }
        // A completion failure must not overwrite a successfully applied local change as failed.
        await room.completeProposal(messageId, "applied")
      } finally {
        setProposalBusyId(null)
      }
    },
    [editor, proposalBusyId, room]
  )

  const rejectProposal = useCallback(
    async (messageId: string) => {
      if (proposalBusyId) return
      setProposalBusyId(messageId)
      try {
        await room.claimProposal(messageId)
        await room.completeProposal(messageId, "rejected")
      } finally {
        setProposalBusyId(null)
      }
    },
    [proposalBusyId, room]
  )

  useEffect(() => {
    if (room.policy?.applyMode !== "auto" || !user?.id || proposalBusyId || editor?.isReadonly()) {
      return
    }
    const proposal = room.messages.find(
      (message) =>
        message.proposal?.status === "pending" &&
        message.replyTo &&
        room.messages.find((candidate) => candidate.id === message.replyTo)?.author.id ===
          user.id &&
        !autoAttemptedRef.current.has(message.id)
    )
    if (!proposal) return
    autoAttemptedRef.current.add(proposal.id)
    void applyProposal(proposal.id)
  }, [applyProposal, editor, proposalBusyId, room.messages, room.policy?.applyMode, user?.id])

  return (
    <>
      <RoomChatPanel
        messages={room.messages}
        aiStatus={room.aiStatus}
        currentUserId={user?.id}
        policy={room.policy}
        allowChanges={room.policy?.allowChanges ?? false}
        canConfigurePolicy={room.policy?.canConfigure ?? false}
        isUpdatingPolicy={room.isUpdatingPolicy}
        isLoading={room.isLoading}
        hasLoadError={room.loadError !== null}
        sendErrorKind={sendErrorKind}
        hasProfileSyncError={profileSyncError}
        isSending={room.isSending || room.isSendingVoice || !profileReady}
        onSend={(text, intent) => void sendQuestion(text, intent).catch(() => undefined)}
        onApplyProposal={(messageId) => void applyProposal(messageId).catch(() => undefined)}
        onRejectProposal={(messageId) => void rejectProposal(messageId).catch(() => undefined)}
        proposalBusyId={proposalBusyId}
        onPolicyChange={({ enabled, allowChanges, applyMode, proactive }) =>
          room.updatePolicy({ enabled, allowChanges, applyMode, proactive })
        }
        preferences={profileRecord?.profile.preferences ?? []}
        onSavePreferences={user?.id ? savePreferences : undefined}
        hasVoiceError={voiceError}
        onUploadImage={(file) => {
          setVisionFile(file ?? null)
          setVisionOpen(true)
        }}
        voiceControls={{
          status: recorder.status,
          elapsed: recorder.elapsed,
          audioUrl: recorder.audioUrl,
          hasSupport: recorder.hasSupport,
          isSending: Boolean(room.isSendingVoice) || !profileReady,
          hasError: voiceError,
          onStartRecording: () => {
            setVoiceError(false)
            void recorder.startRecording()
          },
          onStopRecording: recorder.stopRecording,
          onCancelRecording: () => {
            recorder.cancelRecording()
            setVoiceError(false)
          },
          onSendRecording: () => void sendVoiceQuestion(),
        }}
      />
      {visionOpen && (
        <VisionImportDialog
          open={visionOpen}
          onClose={() => {
            setVisionOpen(false)
            setVisionFile(null)
          }}
          initialFile={visionFile}
          allowInRoom
        />
      )}
    </>
  )
}
