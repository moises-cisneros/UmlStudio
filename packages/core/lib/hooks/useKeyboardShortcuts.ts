import { useEffect, useRef, type RefObject } from "react"
import { useReactFlow } from "@xyflow/react"
import {
  useDiagramStore,
  useMetadataStore,
  useOverlayStore,
} from "@/store/context"
import { useShallow } from "zustand/shallow"
import { useSelectionForCopyPaste } from "./useSelectionForCopyPaste"
import { useDiagramModifiable } from "./useDiagramModifiable"
import { insetAwareFitView } from "@/overlay/fitView"
import { handleShortcutKeydown, type KeyboardShortcutDeps } from "@/keyboard"

export const useKeyboardShortcuts = (
  editorRootRef: RefObject<HTMLElement | null>
) => {
  const pasteCountRef = useRef(0)
  const pasteChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const { undo, redo } = useDiagramStore(
    useShallow((state) => ({ undo: state.undo, redo: state.redo }))
  )
  const setMultiSelectionMode = useMetadataStore(
    (state) => state.setMultiSelectionMode
  )
  const isDiagramModifiable = useDiagramModifiable()
  const enabled = useMetadataStore((state) => state.keyboardShortcuts)
  const rf = useReactFlow()
  const { insets, safeArea } = useOverlayStore(
    useShallow((state) => ({ insets: state.insets, safeArea: state.safeArea }))
  )
  const {
    hasSelectedElements,
    selectAll,
    clearSelection,
    copySelectedElements,
    pasteElements,
    duplicateSelectedElements,
    cutSelectedElements,
  } = useSelectionForCopyPaste()

  const deps: KeyboardShortcutDeps = {
    isDiagramModifiable: () => isDiagramModifiable,
    actions: {
      "select-all": selectAll,
      "clear-selection": () => {
        setMultiSelectionMode(false)
        clearSelection()
      },
      delete: () => {
        const selectedNodes = rf.getNodes().filter((node) => node.selected)
        const selectedEdges = rf.getEdges().filter((edge) => edge.selected)
        if (selectedNodes.length === 0 && selectedEdges.length === 0)
          return false
        editorRootRef.current?.focus({ preventScroll: true })
        void rf.deleteElements({
          nodes: selectedNodes,
          edges: selectedEdges,
        })
      },
      copy: () => {
        if (!hasSelectedElements()) return false
        pasteCountRef.current = 0
        void copySelectedElements()
      },
      cut: () => {
        if (!hasSelectedElements()) return false
        editorRootRef.current?.focus({ preventScroll: true })
        pasteCountRef.current = 0
        void cutSelectedElements()
      },
      paste: () => {
        pasteCountRef.current += 1
        const step = pasteCountRef.current
        pasteChainRef.current = pasteChainRef.current
          .then(() => pasteElements(step))
          .catch(() => {})
      },
      duplicate: () => {
        if (duplicateSelectedElements()) pasteCountRef.current += 1
      },
      undo,
      redo,
      "zoom-in": () => void rf.zoomIn(),
      "zoom-out": () => void rf.zoomOut(),
      "reset-zoom": () => void rf.zoomTo(1),
      "fit-view": () => insetAwareFitView(rf, insets, safeArea),
      "zoom-to-selection": () => {
        const framed = new Set(
          rf
            .getNodes()
            .filter((node) => node.selected)
            .map((node) => node.id)
        )
        for (const edge of rf.getEdges()) {
          if (!edge.selected) continue
          framed.add(edge.source)
          framed.add(edge.target)
        }
        insetAwareFitView(
          rf,
          insets,
          safeArea,
          framed.size > 0
            ? { nodes: [...framed].map((id) => ({ id })) }
            : undefined
        )
      },
    },
  }

  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })

  useEffect(() => {
    if (!enabled) return
    const editorRoot = editorRootRef.current
    if (!editorRoot) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !editorRoot.contains(target)) return
      handleShortcutKeydown(event, depsRef.current)
    }
    const ownerDocument = editorRoot.ownerDocument
    ownerDocument.addEventListener("keydown", onKeyDown)
    return () => ownerDocument.removeEventListener("keydown", onKeyDown)
  }, [editorRootRef, enabled])
}
