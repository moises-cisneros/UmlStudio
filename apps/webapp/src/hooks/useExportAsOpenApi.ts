import { useCallback } from "react"
import { useModalContext } from "@/contexts"

/**
 * Hook to trigger the OpenAPI 3.0 & Swagger UI documentation modal.
 */
export const useExportAsOpenApi = () => {
  const { openModal } = useModalContext()

  const exportAsOpenApi = useCallback(
    (options?: { defaultTab?: "swagger" | "spec" | "postman" }) => {
      openModal("OPENAPI_DOCS", options)
    },
    [openModal]
  )

  return exportAsOpenApi
}
