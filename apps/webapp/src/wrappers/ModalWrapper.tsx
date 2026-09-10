import React from "react";
import {
  NewDiagramModal,
  ShareModal,
  ShareDashboardModal,
  CollaborateNameModal,
  AboutModal,
  HowToUseModal,
} from "@/components/modals";
import {
  ConfirmRestoreModal,
  DeleteVersionModal,
} from "@/components/versioning";
import { versioningStrings as v } from "@/components/versioning/strings";
import { useModalContext } from "@/contexts";
import {
  ModalProgressProvider,
  useModalProgress,
} from "@/contexts/ModalProgressContext";
import { ModalName, ModalProps } from "@/types";
import { log } from "@/logger";
import { isHomeDialogVariant } from "@/components/modals/HomeDialog";
import { ModalFrame, type ModalVariant } from "./ModalFrame";

interface ModalWrapperProps {
  name: ModalName;
  props?: ModalProps;
  closeModal: () => void;
}

const MODAL_COMPONENTS = {
  NEW_DIAGRAM: NewDiagramModal,
  SHARE: ShareModal,
  SHARE_DASHBOARD: ShareDashboardModal,
  COLLABORATE_NAME: CollaborateNameModal,
  HowToUseModal,
  AboutModal,
  DELETE_VERSION: DeleteVersionModal,
  CONFIRM_RESTORE: ConfirmRestoreModal,
} satisfies Record<ModalName, React.ComponentType<never>>;

const MODAL_TITLES: Record<ModalName, string> = {
  NEW_DIAGRAM: "New Diagram",
  SHARE: "Share",
  SHARE_DASHBOARD: "Share your diagram",
  COLLABORATE_NAME: "Join Collaboration",
  HowToUseModal: "How to use this editor?",
  AboutModal: "Information about UmlStudio",
  DELETE_VERSION: "Delete version",
  CONFIRM_RESTORE: v.confirmRestoreTitle,
};

const ModalProgressBar = () => {
  const { isLoading } = useModalProgress();
  if (!isLoading) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      style={{ transition: "opacity 200ms ease" }}
    >
      <div className="share-modal-progress" />
    </div>
  );
};

export const ModalWrapper: React.FC<ModalWrapperProps> = ({ name, props }) => {
  const SpecificModal = MODAL_COMPONENTS[
    name
  ] as unknown as React.ComponentType<ModalProps & { onClose?: () => void }>;
  const { closeModal } = useModalContext();
  const isContentOverflow = Boolean(
    props && typeof props === "object" && props.contentOverflow,
  );
  const isHomeDialog = isContentOverflow || isHomeDialogVariant(props);
  const isConfirmModal =
    name === "DELETE_VERSION" ||
    name === "CONFIRM_RESTORE" ||
    name === "COLLABORATE_NAME";
  const variant: ModalVariant =
    name === "SHARE"
      ? "editor-share"
      : isHomeDialog
        ? name === "NEW_DIAGRAM"
          ? "home-wide"
          : "home-compact"
        : isConfirmModal
          ? "confirm"
          : "plain";

  if (!SpecificModal) {
    log.error(`No modal found for name: ${name}`);
    return null;
  }

  const handleClose = () => {
    const onClose =
      props && typeof props === "object" && "onClose" in props
        ? props.onClose
        : undefined;

    if (typeof onClose === "function") {
      onClose();
    }

    closeModal();
  };

  return (
    <ModalProgressProvider>
      <ModalFrame
        title={MODAL_TITLES[name]}
        variant={variant}
        contentOverflow={isContentOverflow}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        beforeBody={<ModalProgressBar />}
      >
        <SpecificModal {...props} onClose={closeModal} />
      </ModalFrame>
    </ModalProgressProvider>
  );
};
