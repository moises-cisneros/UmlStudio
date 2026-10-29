import { useCallback, useEffect, useState, type FC } from "react"
import { useRoomAi } from "@/queries/roomAiQueries"
import { useAuthStore } from "@/stores/useAuthStore"
import { useEditorContext } from "@/contexts"
import {
  readPersonalRoomProfile,
  writePersonalRoomProfile,
  type PersonalRoomProfileRecord,
  type PersonalRoomTeachingProfile,
} from "@/services/personalRoomMemory"
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder"
import { voiceFileNameForBlob } from "@/components/agentic/voiceFileName"
import { RoomChatPanel } from "./RoomChatPanel"

const DEFAULT_TEACHING_PROFILE: PersonalRoomTeachingProfile = {
  detailLevel: "balanced",
  exampleStyle: "none",
}

export const RoomChatPanelContainer: FC<{ diagramId: string }> = ({ diagramId }) => {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const scopeKey = JSON.stringify([userId, diagramId])
  return <RoomChatPanelContainerScope key={scopeKey} diagramId={diagramId} />
}

const RoomChatPanelContainerScope: FC<{ diagramId: string }> = ({ diagramId }) => {
  const user = useAuthStore((s) => s.user)
  const { flushSharedReplica } = useEditorContext()
  const flush = useCallback(() => {
    if (!flushSharedReplica) return Promise.reject(new Error("Shared replica is unavailable"))
    return flushSharedReplica()
  }, [flushSharedReplica])
  const room = useRoomAi(diagramId, flush)
  const getPersonalProfileRevision = room.getPersonalProfileRevision
  const [profileRecord, setProfileRecord] = useState<PersonalRoomProfileRecord | null>(null)
  const [profileReady, setProfileReady] = useState(() => !user?.id)
  const [profileStorageAvailable, setProfileStorageAvailable] = useState(true)
  const [profileSyncError, setProfileSyncError] = useState(false)
  const [voiceError, setVoiceError] = useState(false)
  const recorder = useVoiceRecorder({ onError: () => setVoiceError(true) })

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
        return null
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

  const sendQuestion = async (text: string) => {
    const profile = await getProfileForInteraction()
    try {
      const result = await room.sendMessage({ text, ...(profile ?? {}) })
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

  return (
    <RoomChatPanel
      messages={room.messages}
      aiStatus={room.aiStatus}
      currentUserId={user?.id}
      isLoading={room.isLoading}
      hasLoadError={room.loadError !== null}
      hasSendError={room.sendError !== null}
      hasProfileSyncError={profileSyncError}
      isSending={room.isSending || room.isSendingVoice || !profileReady}
      onSend={(text) => void sendQuestion(text).catch(() => undefined)}
      hasVoiceError={voiceError}
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
  )
}
