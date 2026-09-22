import React from "react"
import {
  NewDiagramModal,
  ShareModal,
  ShareDashboardModal,
  CollaborateNameModal,
  AboutModal,
  HowToUseModal,
  RenameDiagramModal,
  UserProfileModal,
  SpringBootGenModal,
  OpenApiDocsModal,
  ProductivityModal,
} from "@/components/modals"
import { ConfirmRestoreModal, DeleteVersionModal } from "@/components/versioning"
import { useVersioningTranslation } from "@/components/versioning/strings"
import { useModalContext } from "@/contexts"
import { ModalProgressProvider, useModalProgress } from "@/contexts/ModalProgressContext"
import { ModalName, ModalProps } from "@/types"
import { log } from "@/logger"
import { isHomeDialogVariant } from "@/components/modals/HomeDialog"
import { ModalFrame, type ModalVariant } from "./ModalFrame"
import { useTranslation } from "@/i18n"

interface ModalWrapperProps {
  name: ModalName
  props?: ModalProps
  closeModal: () => void
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
  RENAME_DIAGRAM: RenameDiagramModal,
  USER_PROFILE: UserProfileModal,
  SPRING_BOOT_GEN: SpringBootGenModal,
  OPENAPI_DOCS: OpenApiDocsModal,
  PRODUCTIVITY_METRICS: ProductivityModal,
} satisfies Record<ModalName, React.ComponentType<never>>

const ModalProgressBar = () => {
  const { isLoading } = useModalProgress()
  if (!isLoading) return null

  return (
    <div role="progressbar" aria-label="Loading" style={{ transition: "opacity 200ms ease" }}>
      <div className="share-modal-progress" />
    </div>
  )
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({ name, props }) => {
  const { t } = useTranslation()
  const vt = useVersioningTranslation()
  const SpecificModal = MODAL_COMPONENTS[name] as unknown as React.ComponentType<
    ModalProps & { onClose?: () => void }
  >
  const { closeModal } = useModalContext()
  const isContentOverflow = Boolean(props && typeof props === "object" && props.contentOverflow)
  const isHomeDialog = isContentOverflow || isHomeDialogVariant(props)
  const isConfirmModal =
    name === "DELETE_VERSION" || name === "CONFIRM_RESTORE" || name === "COLLABORATE_NAME"
  const variant: ModalVariant =
    name === "SHARE"
      ? "editor-share"
      : name === "SPRING_BOOT_GEN" || name === "OPENAPI_DOCS" || name === "PRODUCTIVITY_METRICS"
        ? "home-wide"
        : isHomeDialog || name === "RENAME_DIAGRAM"
          ? name === "NEW_DIAGRAM"
            ? "home-wide"
            : "home-compact"
          : isConfirmModal
            ? "confirm"
            : "plain"

  const getModalTitle = (): string => {
    switch (name) {
      case "NEW_DIAGRAM":
        return t.menu.newDiagram.replace(/\.\.\.$/, "")
      case "SHARE":
      case "SHARE_DASHBOARD":
        return t.share.modalTitle
      case "COLLABORATE_NAME":
        return t.share.joinSession
      case "HowToUseModal":
        return t.menu.help
      case "AboutModal":
        return "UmlStudio"
      case "DELETE_VERSION":
        return vt.delete
      case "CONFIRM_RESTORE":
        return vt.confirmRestoreTitle
      case "RENAME_DIAGRAM":
        return "Rename Diagram"
      case "USER_PROFILE":
        return t.profile.title
      case "SPRING_BOOT_GEN":
        return t.codegen.modalTitle
      case "OPENAPI_DOCS":
        return t.openapi.modalTitle
      case "PRODUCTIVITY_METRICS":
        return t.productivity?.modalTitle || "Productividad y Tiempos"
      default:
        return name
    }
  }

  if (!SpecificModal) {
    log.error(`No modal found for name: ${name}`)
    return null
  }

  const handleClose = () => {
    const onClose =
      props && typeof props === "object" && "onClose" in props ? props.onClose : undefined

    if (typeof onClose === "function") {
      onClose()
    }

    closeModal()
  }

  return (
    <ModalProgressProvider>
      <ModalFrame
        title={getModalTitle()}
        variant={variant}
        contentOverflow={isContentOverflow}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
        beforeBody={<ModalProgressBar />}
      >
        <SpecificModal {...props} onClose={closeModal} />
      </ModalFrame>
    </ModalProgressProvider>
  )
}
