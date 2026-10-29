import type { AuthProfile } from "../auth-service.js"
import type { RoomAiReplicaRequirement } from "./chat-repository.js"
import type { PostRoomMessageInput, PostRoomMessageResult } from "./room-ai-service.js"
import { MAX_ROOM_AI_MESSAGE_CHARS } from "./room-ai-limits.js"
import type { RoomAiTranscriber, RoomAiTranscriberInput } from "./room-ai-transcriber.js"
import type { RoomAiTeachingProfile } from "./room-ai-personal-profile.js"

export interface RoomAiVoiceQuestionInput extends RoomAiTranscriberInput {
  diagramId: string
  author: AuthProfile
  replica: RoomAiReplicaRequirement
  teachingProfile?: RoomAiTeachingProfile
  profileRevision?: string
}

export class RoomAiVoiceQuestionUnclearError extends Error {
  constructor() {
    super("No clear speech could be transcribed")
    this.name = "RoomAiVoiceQuestionUnclearError"
  }
}

export class RoomAiVoiceQuestionTooLongError extends Error {
  constructor() {
    super("Room message is too long")
    this.name = "RoomAiVoiceQuestionTooLongError"
  }
}

interface RoomAiVoiceQuestionOptions {
  transcribe: RoomAiTranscriber
  postMessage: (input: PostRoomMessageInput) => Promise<PostRoomMessageResult>
}

const MIN_TRANSCRIPTION_CONFIDENCE = 0.2

export function createRoomAiVoiceQuestionService(options: RoomAiVoiceQuestionOptions) {
  return async function postVoiceQuestion(
    input: RoomAiVoiceQuestionInput
  ): Promise<PostRoomMessageResult> {
    const transcription = await options.transcribe({
      bytes: input.bytes,
      filename: input.filename,
      contentType: input.contentType,
    })
    const text = transcription.text.trim()
    if (!text || transcription.confidence < MIN_TRANSCRIPTION_CONFIDENCE) {
      throw new RoomAiVoiceQuestionUnclearError()
    }
    if (text.length > MAX_ROOM_AI_MESSAGE_CHARS) {
      throw new RoomAiVoiceQuestionTooLongError()
    }

    return options.postMessage({
      diagramId: input.diagramId,
      author: input.author,
      text,
      intent: "ask",
      replica: input.replica,
      ...(input.teachingProfile ? { teachingProfile: input.teachingProfile } : {}),
      ...(input.profileRevision ? { profileRevision: input.profileRevision } : {}),
    })
  }
}

export type RoomAiVoiceQuestionHandler = ReturnType<typeof createRoomAiVoiceQuestionService>
