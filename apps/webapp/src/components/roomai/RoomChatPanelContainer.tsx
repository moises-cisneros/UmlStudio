import { useCallback, useEffect, useState, type FC } from "react"
import type { RoomChatMessage } from "@umlstudio/core"
import { useRoomAi } from "@/queries/roomAiQueries"
import { useAuthStore } from "@/stores/useAuthStore"
import { useEditorContext } from "@/contexts"
import { DiagramApiClient } from "@/services/DiagramApiClient"
import { readPersonalRoomMemory, writePersonalRoomMemory } from "@/services/personalRoomMemory"
import { RoomChatPanel } from "./RoomChatPanel"

const PRIVATE_IDLE_STATUS = { status: "idle" as const, queueLength: 0 }

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

  const [mode, setMode] = useState<"room" | "private">("room")
  const [personalMemory, setPersonalMemory] = useState("")
  const [personalMemoryLoaded, setPersonalMemoryLoaded] = useState(false)
  const [privateMessages, setPrivateMessages] = useState<RoomChatMessage[]>([])
  const [privateSending, setPrivateSending] = useState(false)
  const [privateError, setPrivateError] = useState(false)

  useEffect(() => {
    let active = true
    if (!user?.id) {
      return () => {
        active = false
      }
    }

    void readPersonalRoomMemory(user.id, diagramId)
      .then((value) => {
        if (active) {
          setPersonalMemory(value ?? "")
          setPersonalMemoryLoaded(true)
        }
      })
      .catch(() => {
        if (active) {
          setPersonalMemory("")
          setPersonalMemoryLoaded(true)
          setPrivateError(true)
        }
      })
    return () => {
      active = false
    }
  }, [diagramId, user?.id])

  const sendPrivate = async (text: string) => {
    if (!user?.id || privateSending || !personalMemoryLoaded) return
    const memory = personalMemory
    setPrivateSending(true)
    setPrivateError(false)
    try {
      const replica = await flush()
      const answer = await DiagramApiClient.postPrivateRoomAiMessage(diagramId, {
        text,
        ...(memory.trim() ? { privateContext: memory.trim() } : {}),
        replica,
      })
      const questionId = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      const question: RoomChatMessage = {
        id: questionId,
        diagramId,
        author: { id: user.id, name: user.name, kind: "user" },
        intent: "ask",
        text,
        status: "answered",
        createdAt: timestamp,
      }
      const reply: RoomChatMessage = {
        id: crypto.randomUUID(),
        diagramId,
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        text: answer.text,
        replyTo: questionId,
        createdAt: new Date().toISOString(),
      }
      setPrivateMessages((current) => [...current, question, reply])
    } catch {
      setPrivateError(true)
    } finally {
      setPrivateSending(false)
    }
  }

  const savePersonalMemory = () => {
    if (!user?.id || !personalMemoryLoaded) return
    void writePersonalRoomMemory(user.id, diagramId, personalMemory).catch(() => {
      setPrivateError(true)
    })
  }

  const messages = mode === "private" ? privateMessages : room.messages

  return (
    <RoomChatPanel
      messages={messages}
      mode={mode}
      onModeChange={setMode}
      aiStatus={mode === "private" ? PRIVATE_IDLE_STATUS : room.aiStatus}
      currentUserId={user?.id}
      isLoading={mode === "room" && room.isLoading}
      hasLoadError={mode === "room" && room.loadError !== null}
      hasSendError={mode === "private" ? privateError : room.sendError !== null}
      isSending={mode === "private" ? privateSending || !personalMemoryLoaded : room.isSending}
      onSend={(text) =>
        void (mode === "private"
          ? sendPrivate(text)
          : room.sendMessage(text).catch(() => undefined))
      }
      personalMemory={personalMemory}
      personalMemoryDisabled={!personalMemoryLoaded}
      onPersonalMemoryChange={setPersonalMemory}
      onSavePersonalMemory={savePersonalMemory}
    />
  )
}
