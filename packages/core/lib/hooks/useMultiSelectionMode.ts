import { useEffect } from "react"
import { useStoreApi } from "@xyflow/react"
import { useMetadataStore } from "@/store/context"

export const useMultiSelectionMode = (): boolean => {
  const multiSelectionMode = useMetadataStore((state) => state.multiSelectionMode)
  const store = useStoreApi()

  useEffect(() => {
    if (!multiSelectionMode) return

    store.setState({ multiSelectionActive: true })
    const unsubscribe = store.subscribe((state) => {
      if (!state.multiSelectionActive) {
        store.setState({ multiSelectionActive: true })
      }
    })

    return () => {
      unsubscribe()
      store.setState({ multiSelectionActive: false })
    }
  }, [multiSelectionMode, store])

  return multiSelectionMode
}
