import { useCallback } from "react"
import { useModalContext } from "@/contexts"
import { useCollaborators } from "./useCollaborators"
import { useTranslation } from "@/i18n"
import { toast } from "react-toastify"

/**
 * Hook to trigger the OpenAPI 3.0 & Swagger UI documentation modal.
 */
export const useExportAsOpenApi = () => {
  const { openModal } = useModalContext()
  const { isCollaborativeBlocked } = useCollaborators()
  const { t } = useTranslation()

  const exportAsOpenApi = useCallback(
    (options?: { defaultTab?: "swagger" | "spec" | "postman" }) => {
      if (isCollaborativeBlocked) {
        toast.warning(t.collaborators.exportBlockedToast)
        return
      }
      openModal("OPENAPI_DOCS", options)
    },
    [openModal, isCollaborativeBlocked, t]
  )

  return exportAsOpenApi
}
