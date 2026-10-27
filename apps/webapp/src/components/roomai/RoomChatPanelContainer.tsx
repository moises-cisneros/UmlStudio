import type { FC } from "react"
import { useRoomAi } from "@/queries/roomAiQueries"
import { useAuthStore } from "@/stores/useAuthStore"
import { RoomChatPanel } from "./RoomChatPanel"

export const RoomChatPanelContainer: FC<{ diagramId: string }> = ({ diagramId }) => {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const room = useRoomAi(diagramId)

  return (
    <RoomChatPanel
      messages={room.messages}
      aiStatus={room.aiStatus}
      currentUserId={currentUserId}
      isLoading={room.isLoading}
      hasLoadError={room.loadError !== null}
      hasSendError={room.sendError !== null}
      isSending={room.isSending}
      onSend={(text) => void room.sendMessage(text).catch(() => undefined)}
    />
  )
}
