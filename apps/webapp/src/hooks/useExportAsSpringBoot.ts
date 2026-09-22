import { useCallback } from "react"
import { useModalContext } from "@/contexts"

/**
 * Hook to trigger the Spring Boot & SQL generation modal.
 */
export const useExportAsSpringBoot = () => {
  const { openModal } = useModalContext()

  const exportAsSpringBoot = useCallback(() => {
    openModal("SPRING_BOOT_GEN")
  }, [openModal])

  return exportAsSpringBoot
}
