import { useCallback } from "react"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { RoomAiIntent, RoomAiPolicy } from "@umlstudio/core"
import { DiagramApiClient, type RoomAiPolicyView } from "@/services/DiagramApiClient"
import type { PersonalRoomTeachingProfile } from "@/services/personalRoomMemory"
import { roomAiKeys } from "./keys"
import { IDLE_ROOM_AI_STATUS, type RoomAiStatusState } from "./roomAiCache"

export function roomAiMessagesQueryOptions(diagramId: string) {
  return queryOptions({
    queryKey: roomAiKeys.messages(diagramId),
    queryFn: ({ signal }) => DiagramApiClient.fetchRoomAiMessages(diagramId, { signal }),
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
  const policy = useQuery<RoomAiPolicyView>({
    queryKey: roomAiKeys.policy(diagramId),
    queryFn: ({ signal }) => DiagramApiClient.fetchRoomAiPolicy(diagramId, { signal }),
    staleTime: Infinity,
  })

  const updatePolicy = useMutation({
    mutationFn: (nextPolicy: RoomAiPolicy) =>
      DiagramApiClient.updateRoomAiPolicy(diagramId, nextPolicy),
    onSuccess: (nextPolicy) => {
      queryClient.setQueryData<RoomAiPolicyView>(roomAiKeys.policy(diagramId), (current) => ({
        ...nextPolicy,
        canConfigure: current?.canConfigure ?? false,
      }))
    },
  })

  const send = useMutation({
    mutationFn: async (input: {
      text: string
      intent?: RoomAiIntent
      teachingProfile?: PersonalRoomTeachingProfile
      profileRevision?: string
    }) => {
      const replica = await flushSharedReplica()
      return DiagramApiClient.postRoomAiMessage(diagramId, {
        ...input,
        intent: input.intent ?? "ask",
        replica,
      })
    },
    // The broadcast normally delivers the message; refetch covers a dropped socket.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomAiKeys.messages(diagramId) }),
  })

  const sendVoice = useMutation({
    mutationFn: async (input: {
      file: Blob
      filename: string
      teachingProfile?: PersonalRoomTeachingProfile
      profileRevision?: string
    }) => {
      const replica = await flushSharedReplica()
      return DiagramApiClient.postRoomAiVoiceMessage(diagramId, { ...input, replica })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomAiKeys.messages(diagramId) }),
  })

  const getPersonalProfileRevision = useCallback(
    () => DiagramApiClient.fetchRoomAiPersonalProfileRevision(diagramId),
    [diagramId]
  )

  return {
    messages: history.data?.messages ?? [],
    isLoading: history.isPending,
    loadError: history.error,
    aiStatus: status.data,
    policy: policy.data,
    updatePolicy: updatePolicy.mutateAsync,
    isUpdatingPolicy: updatePolicy.isPending,
    sendMessage: send.mutateAsync,
    sendVoiceMessage: sendVoice.mutateAsync,
    getPersonalProfileRevision,
    isSendingVoice: sendVoice.isPending,
    sendVoiceError: sendVoice.error,
    isSending: send.isPending,
    sendError: send.error,
  }
}
