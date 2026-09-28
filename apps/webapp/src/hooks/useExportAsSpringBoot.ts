import { useCallback } from "react"
import { useModalContext } from "@/contexts"
import { useCollaborators } from "./useCollaborators"
import { useTranslation } from "@/i18n"
import { toast } from "react-toastify"

/**
 * Hook to trigger the Spring Boot & SQL generation modal.
 */
export const useExportAsSpringBoot = () => {
  const { openModal } = useModalContext()
  const { isCollaborativeBlocked } = useCollaborators()
  const { t } = useTranslation()

  const exportAsSpringBoot = useCallback(() => {
    if (isCollaborativeBlocked) {
      toast.warning(t.collaborators.exportBlockedToast)
      return
    }
    openModal("SPRING_BOOT_GEN")
  }, [openModal, isCollaborativeBlocked, t])

  return exportAsSpringBoot
}
