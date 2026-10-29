import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DiagramApiClient } from "@/services/DiagramApiClient"
import { roomAiKeys } from "./keys"
import { IDLE_ROOM_AI_STATUS, type RoomAiStatusState } from "./roomAiCache"

export function roomAiMessagesQueryOptions(diagramId: string) {
  return queryOptions({
    queryKey: roomAiKeys.messages(diagramId),
    queryFn: ({ signal }) => DiagramApiClient.fetchRoomAiMessages(diagramId, { signal }),
    refetchOnWindowFocus: false,
  })
}

export function roomAiMemoryQueryOptions(diagramId: string) {
  return queryOptions({
    queryKey: roomAiKeys.memory(diagramId),
    queryFn: ({ signal }) => DiagramApiClient.fetchRoomAiMemory(diagramId, { signal }),
    refetchOnWindowFocus: false,
  })
}

/**
 * Shared room conversation: history over REST, live updates pushed into the
 * query cache by `applyRoomAiEventToCache` (fed from the room WebSocket).
 */
export function useRoomAi(
  diagramId: string,
  flushSharedReplica: () => Promise<{ generation: string; revision: number }>
) {
  const queryClient = useQueryClient()

  const history = useQuery(roomAiMessagesQueryOptions(diagramId))
  const status = useQuery<RoomAiStatusState>({
    queryKey: roomAiKeys.status(diagramId),
    queryFn: () => IDLE_ROOM_AI_STATUS,
    initialData: IDLE_ROOM_AI_STATUS,
    staleTime: Infinity,
  })
  const sharedMemory = useQuery(roomAiMemoryQueryOptions(diagramId))

  const send = useMutation({
    mutationFn: async (text: string) => {
      const replica = await flushSharedReplica()
      return DiagramApiClient.postRoomAiMessage(diagramId, { text, intent: "ask", replica })
    },
    // The broadcast normally delivers the message; refetch covers a dropped socket.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomAiKeys.messages(diagramId) }),
  })

  const pin = useMutation({
    mutationFn: (text: string) => DiagramApiClient.pinRoomAiDecision(diagramId, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomAiKeys.memory(diagramId) }),
  })

  return {
    messages: history.data?.messages ?? [],
    isLoading: history.isPending,
    loadError: history.error,
    aiStatus: status.data,
    sendMessage: send.mutateAsync,
    sharedMemory: sharedMemory.data ?? null,
    pinMessage: pin.mutate,
    pinError: pin.error,
    sharedMemoryError: sharedMemory.error,
    isSending: send.isPending,
    sendError: send.error,
  }
}
