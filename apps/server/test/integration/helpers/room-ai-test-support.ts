import { createRoomAiDispatcher } from "../../../src/services/room-ai/room-ai-dispatcher.js"
import { createRoomAiService } from "../../../src/services/room-ai/room-ai-service.js"
import type { RoomAiReplicaRequirement } from "../../../src/services/room-ai/chat-repository.js"

export const TEST_ROOM_AI_REPLICA: RoomAiReplicaRequirement = {
  generation: "a".repeat(64),
  revision: 3,
}

const readyReplica = {
  isComplete: () => true,
  getModel: () => ({ id: "test-room", nodes: [], edges: [] }),
}

type ServiceDeps = Parameters<typeof createRoomAiService>[0]
type DispatcherDeps = Parameters<typeof createRoomAiDispatcher>[0]

export function createRoomAiTestService(options: ServiceDeps) {
  const { ttlSeconds, getSharedBoardReplicaAtLeast } = options
  const service = createRoomAiService({
    ...options,
    ttlSeconds,
    getSharedBoardReplicaAtLeast: getSharedBoardReplicaAtLeast ?? (() => readyReplica as never),
  })
  return {
    ...service,
    postMessage: (input: Omit<Parameters<typeof service.postMessage>[0], "replica">) =>
      service.postMessage({ ...input, replica: TEST_ROOM_AI_REPLICA }),
  }
}

export function createRoomAiTestDispatcher(
  deps: Omit<DispatcherDeps, "getReplicaRequirement"> & {
    getReplicaRequirement?: DispatcherDeps["getReplicaRequirement"]
  }
) {
  return createRoomAiDispatcher({
    ...deps,
    getReplicaRequirement: deps.getReplicaRequirement ?? (async () => TEST_ROOM_AI_REPLICA),
  })
}
