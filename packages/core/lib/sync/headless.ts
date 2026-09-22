import * as Y from "yjs"
import type { StoreApi } from "zustand"
import type { DiagramStore } from "@/store/diagramStore"
import type { MetadataStore } from "@/store/metadataStore"
import { YjsSync } from "./yjsSync"

export function createHeadlessSync(ydoc: Y.Doc = new Y.Doc()): {
  ydoc: Y.Doc
  sync: YjsSync
} {
  const noop = () => {}
  const diagramStore: StoreApi<DiagramStore> = {
    getState: () =>
      ({
        updateNodesFromYjs: noop,
        updateEdgesFromYjs: noop,
        updateAssessmentFromYjs: noop,
        updateUndoRedoState: noop,
        setDraggingNodesPublisher: noop,
        undoManager: null,
      }) as unknown as DiagramStore,
    setState: noop,
    subscribe: () => noop,
    getInitialState: () => ({}) as DiagramStore,
  }
  const metadataStore: StoreApi<MetadataStore> = {
    getState: () => ({ updateMetaDataFromYjs: noop }) as unknown as MetadataStore,
    setState: noop,
    subscribe: () => noop,
    getInitialState: () => ({}) as MetadataStore,
  }
  const sync = new YjsSync(ydoc, diagramStore, metadataStore)
  return { ydoc, sync }
}
