export type ModalName =
  | "NEW_DIAGRAM"
  | "SHARE"
  | "SHARE_DASHBOARD"
  | "COLLABORATE_NAME"
  | "HowToUseModal"
  | "AboutModal"
  | "DELETE_VERSION"
  | "CONFIRM_RESTORE";

export interface ModalProps {
  [key: string]: unknown;
}

export enum DiagramView {
  EDITOR = "EDITOR",
  LECTOR = "LECTOR",
}
