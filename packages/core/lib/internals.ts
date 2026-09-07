export { YjsSync, MessageType } from "./sync/yjsSync"
export type { SendBroadcastMessage } from "./sync/yjsSync"
export { createHeadlessSync } from "./sync/headless"

export {
  convertV2ToV4,
  convertV3ToV4,
  convertV3HandleToV4,
  convertV3NodeTypeToV4,
  convertV3EdgeTypeToV4,
  convertV3MessagesToV4,
  isV2Format,
  isV3Format,
  isV4Format,
} from "./utils/versionConverter"
export type * from "./utils/v3Typings"
