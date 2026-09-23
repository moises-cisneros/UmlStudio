import ReactDOM from "react-dom/client"
import { assessedIdsFor, hasAssessmentToShow } from "@/utils/assessmentPresence"
import type { CSSProperties } from "react"
import { AppWithProvider } from "./App"
import { ReactFlowInstance, type Node, type Edge } from "@xyflow/react"
import {
  parseDiagramType,
  mapFromReactFlowNodeToUmlStudioNode,
  mapFromReactFlowEdgeToUmlStudioEdge,
  filterRenderedElements,
  getSVG,
  getRenderedDiagramBounds,
  getElementIdsByTag,
  resolveTagConfig,
  applyElementTags,
} from "./utils"
import { CURRENT_MODEL_VERSION, normalizeModel } from "./utils/versionConverter"
import { UMLDiagramType } from "./types"
import { createDiagramStore, type DiagramStore } from "@/store/diagramStore"
import { createMetadataStore, type MetadataStore } from "@/store/metadataStore"
import { createPopoverStore, type PopoverStore } from "@/store/popoverStore"
import {
  createAssessmentSelectionStore,
  type AssessmentSelectionStore,
} from "@/store/assessmentSelectionStore"
import { createAlignmentGuidesStore } from "@/store/alignmentGuidesStore"
import { createEdgeGeometryStore, type EdgeGeometryStore } from "@/store/edgeGeometryStore"
import {
  DiagramStoreContext,
  MetadataStoreContext,
  PopoverStoreContext,
  AssessmentSelectionStoreContext,
  AlignmentGuidesStoreContext,
  EdgeGeometryStoreContext,
  OverlayStoreContext,
} from "./store/context"
import { createOverlayStore, type OverlayStore } from "./overlay/overlayStore"
import {
  assertBuiltInControlRegion,
  preserveBuiltInControlKind,
  defaultControls,
} from "./chrome/builtins/controls"
import { mergeLabels } from "./i18n/labels"
import { insetAwareFitView } from "./overlay/fitView"
import { RegionMount } from "./overlay/RegionMount"
import {
  type InsetContribution,
  type OverlayControlInput,
  type OverlayControlSnapshot,
  type OverlayRegion,
  type OverlaySide,
  OVERLAY_REGIONS,
  ZERO_INSETS,
} from "./overlay/types"
import { getPerfCounters } from "./sync/perfCounters"
import { MessageType, SendBroadcastMessage, YjsSync } from "./sync/yjsSync"
import { getNodesMap } from "./sync/ydoc"
import * as Y from "yjs"
import { StoreApi } from "zustand"
import * as UmlStudio from "./typings"
import { FONT_FAMILY, DEFAULT_FONT_SIZE } from "./fontStack"
import { getAssessmentElementCenter } from "./utils/assessmentFocus"

const normalizeCollaborationOptions = (options?: UmlStudio.UmlStudioOptions) => {
  const collaboration = options?.collaboration
  const enabled =
    collaboration?.enabled ?? options?.collaborationEnabled ?? Boolean(collaboration?.user)
  const showVisualsByDefault = enabled && Boolean(collaboration?.user)

  return {
    enabled,
    user: collaboration?.user,
    showPresence: collaboration?.showPresence ?? false,
    showCursors: collaboration?.showCursors ?? showVisualsByDefault,
    showSelectionHighlights: collaboration?.showSelectionHighlights ?? showVisualsByDefault,
    showFollow: collaboration?.showFollow ?? showVisualsByDefault,
  }
}

const disabledCollaboration = {
  enabled: false,
  showPresence: false,
  showCursors: false,
  showSelectionHighlights: false,
  showFollow: false,
}

function cloneInsetSnapshot(inset: InsetContribution | undefined): InsetContribution | undefined {
  if (inset === undefined || inset === "auto") return inset
  return Object.freeze({ ...inset })
}

function cloneStyleSnapshot(style: CSSProperties | undefined): CSSProperties | undefined {
  return style ? Object.freeze({ ...style }) : undefined
}

const noopCollaborationAwareness = {
  setLocalAwarenessCursor: () => {},
  setLocalAwarenessSelectedElement: () => {},
  setLocalAwarenessViewport: () => {},
  setLocalAwarenessFollowing: () => {},
  getAwarenessStates: () => new Map(),
  subscribeToAwarenessChanges: () => () => {},
  subscribeToCollaboratorChanges: () => () => {},
  getLocalAwarenessClientId: () => 0,
}

export class UmlStudioEditor {
  private root: ReactDOM.Root
  private reactFlowInstance: ReactFlowInstance | null = null
  private readonly syncManager: YjsSync
  private readonly ydoc: Y.Doc
  private readonly diagramStore: StoreApi<DiagramStore>
  private readonly metadataStore: StoreApi<MetadataStore>
  private readonly popoverStore: StoreApi<PopoverStore>
  private readonly assessmentSelectionStore: StoreApi<AssessmentSelectionStore>
  private readonly edgeGeometryStore: StoreApi<EdgeGeometryStore>
  private readonly overlayStore: StoreApi<OverlayStore>
  private readonly hostRegionEls = new Map<OverlayRegion, HTMLElement>()
  private readonly controlGenerations = new Map<string, number>()
  private subscribers: UmlStudio.Subscribers = {}
  constructor(element: HTMLElement, options?: UmlStudio.UmlStudioOptions) {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Element is required to initialize UmlStudio")
    }

    if (options?.theme) {
      for (const [key, value] of Object.entries(options.theme)) {
        if (value !== undefined) element.style.setProperty(key, value)
      }
    }
    if (options?.dataTheme !== undefined) {
      element.setAttribute("data-theme", options.dataTheme)
    }

    this.ydoc = new Y.Doc()
    this.diagramStore = createDiagramStore(this.ydoc)
    this.metadataStore = createMetadataStore(
      this.ydoc,
      () => this.diagramStore.getState().previewMode
    )
    this.popoverStore = createPopoverStore()
    this.assessmentSelectionStore = createAssessmentSelectionStore()
    const alignmentGuidesStore = createAlignmentGuidesStore()
    this.edgeGeometryStore = createEdgeGeometryStore()
    this.overlayStore = createOverlayStore()
    this.syncManager = new YjsSync(this.ydoc, this.diagramStore, this.metadataStore)
    const collaboration = normalizeCollaborationOptions(options)
    if (collaboration.enabled && collaboration.user) {
      this.syncManager.setLocalAwarenessState({
        user: collaboration.user,
        selectedElementId: null,
      })
    }

    const diagramId = options?.model?.id || Math.random().toString(36).substring(2, 15)

    this.root = ReactDOM.createRoot(element, {
      identifierPrefix: `umlstudio-${diagramId}`,
    })

    this.diagramStore.getState().setDiagramId(diagramId)

    const diagramName = options?.model?.title ?? ""
    const diagramType = options?.type || options?.model?.type || UMLDiagramType.ClassDiagram
    this.metadataStore.getState().updateMetaData(diagramName, parseDiagramType(diagramType))

    if (options?.model) {
      const model = normalizeModel(options.model)
      const nodes = model.nodes || []
      const edges = model.edges || []
      const assessments = model.assessments || {}
      this.diagramStore.getState().setNodesAndEdges(nodes, edges)
      this.diagramStore.getState().setAssessments(assessments)
      this.diagramStore.getState().setInteractive(model.interactive)
    }

    if (options?.mode) {
      this.metadataStore.getState().setMode(options.mode)
    }
    if (options?.view) {
      this.metadataStore.getState().setView(options.view)
    }
    const availableViews = options?.availableViews
      ? Array.from(
          new Set([
            UmlStudio.UmlStudioView.Modelling,
            ...options.availableViews,
            ...(options.view ? [options.view] : []),
          ])
        )
      : options?.view === UmlStudio.UmlStudioView.Highlight
        ? [UmlStudio.UmlStudioView.Modelling, UmlStudio.UmlStudioView.Highlight]
        : undefined
    if (availableViews) {
      this.metadataStore.getState().setAvailableViews(availableViews)
    }
    if (options?.enablePopups !== undefined) {
      this.popoverStore.getState().setPopupEnabled(options.enablePopups)
    }
    if (options?.readonly !== undefined) {
      this.metadataStore.getState().setReadonly(options.readonly)
    }
    if (options?.debug !== undefined) {
      this.metadataStore.getState().setDebug(options.debug)
    }
    if (options?.scrollLock !== undefined) {
      this.metadataStore.getState().setScrollLock(options.scrollLock)
    }
    if (options?.keyboardShortcuts !== undefined) {
      this.metadataStore.getState().setKeyboardShortcuts(options.keyboardShortcuts)
    }
    if (options?.labels !== undefined) {
      this.metadataStore.getState().setLabels(mergeLabels(options.labels))
    }
    if (options?.tags !== undefined) {
      this.metadataStore.getState().setTagConfig(resolveTagConfig(options.tags))
    }
    for (const control of options?.controls ?? defaultControls()) this.addControl(control)

    this.diagramStore.getState().setCollaborationEnabled(collaboration.enabled)

    if (this.metadataStore.getState().mode === UmlStudio.UmlStudioMode.Modelling) {
      this.diagramStore.getState().initializeUndoManager()
    }

    this.root.render(
      <DiagramStoreContext value={this.diagramStore}>
        <MetadataStoreContext value={this.metadataStore}>
          <PopoverStoreContext value={this.popoverStore}>
            <AssessmentSelectionStoreContext value={this.assessmentSelectionStore}>
              <AlignmentGuidesStoreContext value={alignmentGuidesStore}>
                <EdgeGeometryStoreContext value={this.edgeGeometryStore}>
                  <OverlayStoreContext value={this.overlayStore}>
                    <AppWithProvider
                      onReactFlowInit={this.setReactFlowInstance.bind(this)}
                      collaboration={collaboration}
                      awareness={{
                        setLocalAwarenessCursor: this.syncManager.setLocalAwarenessCursor,
                        setLocalAwarenessSelectedElement:
                          this.syncManager.setLocalAwarenessSelectedElement,
                        setLocalAwarenessViewport: this.syncManager.setLocalAwarenessViewport,
                        setLocalAwarenessFollowing: this.syncManager.setLocalAwarenessFollowing,
                        getAwarenessStates: this.syncManager.getAwarenessStates,
                        subscribeToAwarenessChanges: this.syncManager.subscribeToAwarenessChanges,
                        subscribeToCollaboratorChanges:
                          this.syncManager.subscribeToCollaboratorChanges,
                        getLocalAwarenessClientId: this.syncManager.getLocalAwarenessClientId,
                      }}
                    />
                  </OverlayStoreContext>
                </EdgeGeometryStoreContext>
              </AlignmentGuidesStoreContext>
            </AssessmentSelectionStoreContext>
          </PopoverStoreContext>
        </MetadataStoreContext>
      </DiagramStoreContext>
    )
  }

  private setReactFlowInstance(instance: ReactFlowInstance) {
    this.reactFlowInstance = instance
  }

  public getNodes(): Node[] {
    if (this.reactFlowInstance) {
      return this.reactFlowInstance.getNodes()
    }
    return []
  }

  public getEdges(): Edge[] {
    return this.reactFlowInstance ? this.reactFlowInstance.getEdges() : []
  }

  public getViewport(): { x: number; y: number; zoom: number } | null {
    if (!this.reactFlowInstance) {
      return null
    }
    return this.reactFlowInstance.getViewport()
  }

  public screenToFlowPosition(position: { x: number; y: number }) {
    if (!this.reactFlowInstance) {
      return null
    }
    return this.reactFlowInstance.screenToFlowPosition(position, {
      snapToGrid: false,
    })
  }

  public flowToScreenPosition(position: { x: number; y: number }) {
    if (!this.reactFlowInstance) {
      return null
    }
    return this.reactFlowInstance.flowToScreenPosition(position)
  }

  public fitView(options?: {
    padding?: number | Partial<Record<OverlaySide, number>>
    duration?: number
    respectInsets?: boolean
  }): void {
    const duration = options?.duration ?? 200
    const respectInsets = options?.respectInsets ?? true
    const explicit = options?.padding
    const maxAttempts = 10
    let attempts = 0

    const attempt = () => {
      attempts++
      const rf = this.reactFlowInstance
      if (!rf) return
      const rfNodes = rf.getNodes()
      const expected = this.diagramStore.getState().nodes.length
      if (expected === 0) return
      const allMeasured =
        rfNodes.length >= expected &&
        rfNodes.every(
          (n) =>
            (n.measured?.width ?? n.width ?? 0) > 0 && (n.measured?.height ?? n.height ?? 0) > 0
        )
      if (allMeasured || attempts >= maxAttempts) {
        const overlay = this.overlayStore.getState()
        const insets = respectInsets ? overlay.insets : ZERO_INSETS
        insetAwareFitView(rf, insets, overlay.safeArea, {
          padding: explicit,
          duration,
        })
        return
      }
      requestAnimationFrame(attempt)
    }
    requestAnimationFrame(attempt)
  }

  public addControl(control: OverlayControlInput): () => void {
    if (!control.id) throw new Error("[UmlStudioEditor] addControl: id must be non-empty")
    if (!OVERLAY_REGIONS.includes(control.region))
      throw new Error(`[UmlStudioEditor] addControl: unknown region: ${control.region}`)
    const generation = (this.controlGenerations.get(control.id) ?? 0) + 1
    this.controlGenerations.set(control.id, generation)
    this.overlayStore.getState().register(control)
    return () => {
      if (this.controlGenerations.get(control.id) !== generation) return
      this.overlayStore.getState().unregister(control.id)
      this.controlGenerations.delete(control.id)
    }
  }

  public updateControl(id: string, patch: Partial<OverlayControlInput>): void {
    const existing = this.overlayStore.getState().controls[id]
    if (!existing) return
    if (patch.region !== undefined && !OVERLAY_REGIONS.includes(patch.region))
      throw new Error(`[UmlStudioEditor] updateControl: unknown region: ${patch.region}`)
    const next = { ...existing, ...patch, id }
    if (patch.render === undefined) preserveBuiltInControlKind(existing, next)
    if (patch.region !== undefined) assertBuiltInControlRegion(next, patch.region)
    this.overlayStore.getState().register(next)
  }

  public removeControl(id: string): void {
    this.controlGenerations.delete(id)
    this.overlayStore.getState().unregister(id)
  }

  public hasControl(id: string): boolean {
    return id in this.overlayStore.getState().controls
  }

  public getControl(id: string): OverlayControlSnapshot | undefined {
    const control = this.overlayStore.getState().controls[id]
    if (!control) return undefined
    return Object.freeze({
      id: control.id,
      region: control.region,
      inset: cloneInsetSnapshot(control.inset),
      order: control.order,
      lane: control.lane,
      interactive: control.interactive,
      groupLabel: control.groupLabel,
      visible: control.visible,
      className: control.className,
      style: cloneStyleSnapshot(control.style),
    })
  }

  public getRegionElement(region: OverlayRegion): HTMLElement {
    if (!OVERLAY_REGIONS.includes(region))
      throw new Error(`[UmlStudioEditor] getRegionElement: unknown region: ${region}`)
    let el = this.hostRegionEls.get(region)
    if (el) return el
    el = document.createElement("div")
    this.hostRegionEls.set(region, el)
    const node = el
    this.overlayStore.getState().register({
      id: `umlstudio:host:${region}`,
      region,
      inset: "auto",
      interactive: false,
      render: () => <RegionMount el={node} />,
    })
    return el
  }

  public releaseRegionElement(region: OverlayRegion): void {
    this.overlayStore.getState().unregister(`umlstudio:host:${region}`)
    this.hostRegionEls.delete(region)
  }

  set diagramType(type: UMLDiagramType) {
    this.metadataStore.getState().updateDiagramType(type)
    this.diagramStore.getState().setNodesAndEdges([], [])
    this.diagramStore.getState().setAssessments({})
  }

  public destroy() {
    try {
      Object.keys(this.subscribers).forEach((subscriberId) => {
        this.subscribers[parseInt(subscriberId)]?.()
      })
      this.subscribers = {}

      this.syncManager.stopSync()
      this.root.unmount()
      this.ydoc.destroy()
      this.hostRegionEls.clear()
      this.controlGenerations.clear()
      this.reactFlowInstance = null
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[UmlStudioEditor] destroy() partial failure:", err)
    }
  }

  static async exportModelAsSvg(
    model: UmlStudio.UMLModel,
    options?: UmlStudio.ExportOptions
  ): Promise<UmlStudio.SVG> {
    normalizeModel(model)
    const container = document.createElement("div")
    container.style.display = "flex"
    container.style.width = "4000px"
    container.style.height = "4000px"
    container.style.zIndex = "-1000"
    container.style.top = "0"
    container.style.position = "fixed"
    container.style.left = "0"
    container.style.contain = "strict"
    container.style.pointerEvents = "none"
    container.style.visibility = "hidden"
    container.setAttribute("aria-hidden", "true")

    document.body.appendChild(container)

    let exportStyleEl: HTMLStyleElement | undefined
    try {
      const [{ EXPORT_LAYOUT_CSS }, { INTER_FONT_FACE_CSS }] = await Promise.all([
        import("./utils/exportStyles"),
        import("./utils/exportFonts"),
      ])
      exportStyleEl = document.createElement("style")
      exportStyleEl.setAttribute("data-umlstudio-export-styles", "")
      exportStyleEl.textContent = `${EXPORT_LAYOUT_CSS}\n${INTER_FONT_FACE_CSS}`
      document.head.appendChild(exportStyleEl)
    } catch {
      // Ignore stylesheet injection failure in headless or test environments
    }

    const ydoc = new Y.Doc()
    const diagramStore = createDiagramStore(ydoc)
    const metadataStore = createMetadataStore(ydoc, () => diagramStore.getState().previewMode)
    const popoverStore = createPopoverStore()
    const assessmentSelectionStore = createAssessmentSelectionStore()
    const alignmentGuidesStore = createAlignmentGuidesStore()
    const edgeGeometryStore = createEdgeGeometryStore()
    const overlayStore = createOverlayStore()
    const diagramId = Math.random().toString(36).substring(2, 15)

    let setReactFlowInstance: (instance: ReactFlowInstance) => void = () => {}

    const reactFlowInstancePromise = new Promise<ReactFlowInstance>((resolve) => {
      setReactFlowInstance = resolve
    })

    const svgRoot = ReactDOM.createRoot(container, {
      identifierPrefix: `umlstudio-exportAsSVG-${diagramId}`,
    })

    const teardown = () => {
      exportStyleEl?.remove()
      svgRoot.unmount()
      container.remove()
      ydoc.destroy()
    }

    try {
      const routingGeneration = edgeGeometryStore.getState().acceptedGeneration
      diagramStore.getState().setNodesAndEdges(model.nodes, model.edges)
      diagramStore.getState().setAssessments(model.assessments)

      svgRoot.render(
        <DiagramStoreContext value={diagramStore}>
          <MetadataStoreContext value={metadataStore}>
            <PopoverStoreContext value={popoverStore}>
              <AssessmentSelectionStoreContext value={assessmentSelectionStore}>
                <AlignmentGuidesStoreContext value={alignmentGuidesStore}>
                  <EdgeGeometryStoreContext value={edgeGeometryStore}>
                    <OverlayStoreContext value={overlayStore}>
                      <AppWithProvider
                        onReactFlowInit={setReactFlowInstance}
                        collaboration={disabledCollaboration}
                        awareness={noopCollaborationAwareness}
                        onlyRenderVisibleElements={false}
                      />
                    </OverlayStoreContext>
                  </EdgeGeometryStoreContext>
                </AlignmentGuidesStoreContext>
              </AssessmentSelectionStoreContext>
            </PopoverStoreContext>
          </MetadataStoreContext>
        </DiagramStoreContext>
      )

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3000)
      })

      const reactFlowInstance = await Promise.race([reactFlowInstancePromise, timeoutPromise])

      if (!reactFlowInstance) {
        throw new Error("React Flow instance not initialized")
      }

      if (typeof document !== "undefined" && document.fonts) {
        if (document.fonts.load) {
          const size = DEFAULT_FONT_SIZE
          await Promise.all([
            document.fonts.load(`400 ${size}px ${FONT_FAMILY}`),
            document.fonts.load(`700 ${size}px ${FONT_FAMILY}`),
            document.fonts.load(`italic 400 ${size}px ${FONT_FAMILY}`),
            document.fonts.load(`italic 700 ${size}px ${FONT_FAMILY}`),
          ]).catch(() => {})
        }
        if (document.fonts.ready) {
          await document.fonts.ready.catch(() => {})
        }
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      if (model.edges.length > 0) {
        await Promise.race([
          edgeGeometryStore.getState().waitForSettled(routingGeneration),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Edge geometry did not settle before export")), 3000)
          }),
        ])
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
      }

      filterRenderedElements(container, options)

      const bounds = getRenderedDiagramBounds(reactFlowInstance, container)

      const margin = 60
      const clip = {
        x: bounds.x - margin,
        y: bounds.y - margin,
        width: bounds.width + margin * 2,
        height: bounds.height + margin * 2,
      }

      let fontFaceCss: string | undefined
      if (options?.svgMode === "compat") {
        try {
          fontFaceCss = (await import("./utils/exportFonts")).INTER_FONT_FACE_CSS
        } catch {
          fontFaceCss = undefined
        }
      }

      const svgString = getSVG(container, clip, options, fontFaceCss)

      return { svg: svgString, clip }
    } finally {
      teardown()
    }
  }

  exportAsSVG(options?: UmlStudio.ExportOptions): Promise<UmlStudio.SVG> {
    return UmlStudioEditor.exportModelAsSvg(this.model, options)
  }

  private getNewSubscriptionId(): number {
    const subscribers = this.subscribers
    if (Object.keys(subscribers).length === 0) return 0
    return Math.max(...Object.keys(subscribers).map((key) => parseInt(key))) + 1
  }

  public subscribeToModelChange(callback: (state: UmlStudio.UMLModel) => void): number {
    const subscriberId = this.getNewSubscriptionId()
    const unsubscribeCallback = this.diagramStore.subscribe((state) => {
      const isDragging = state.nodes.some((n) => n.dragging)
      if (isDragging) {
        return
      }
      callback(this.model)
    })
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public subscribeToDiagramNameChange(callback: (diagramTitle: string) => void) {
    const subscriberId = this.getNewSubscriptionId()
    const unsubscribeCallback = this.metadataStore.subscribe((state) =>
      callback(state.diagramTitle)
    )
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public subscribeToAssessmentSelection(callback: (selectedElementIds: string[]) => void) {
    const subscriberId = this.getNewSubscriptionId()
    const unsubscribeCallback = this.assessmentSelectionStore.subscribe((state) =>
      callback(state.selectedElementIds)
    )
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public subscribeToSelectionChange(callback: (selectedElementIds: string[]) => void) {
    const subscriberId = this.getNewSubscriptionId()
    let prev = this.diagramStore.getState().selectedElementIds
    const unsubscribeCallback = this.diagramStore.subscribe((state) => {
      const next = state.selectedElementIds
      if (next !== prev) {
        prev = next
        callback(next)
      }
    })
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public subscribeToAwarenessChanges(
    callback: (states: Map<number, UmlStudio.CollaborationState>) => void
  ) {
    const subscriberId = this.getNewSubscriptionId()
    const unsubscribeCallback = this.syncManager.subscribeToAwarenessChanges(callback)
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public subscribeToCollaboratorChanges(
    callback: (collaborators: UmlStudio.CollaboratorInfo[]) => void
  ) {
    const subscriberId = this.getNewSubscriptionId()
    const unsubscribeCallback = this.syncManager.subscribeToCollaboratorChanges(callback)
    this.subscribers[subscriberId] = unsubscribeCallback
    return subscriberId
  }

  public unsubscribe(subscriberId: number) {
    const unsubscribeCallback = this.subscribers[subscriberId]
    if (unsubscribeCallback) {
      unsubscribeCallback()
      delete this.subscribers[subscriberId]
    }
  }

  public sendBroadcastMessage(sendFn: SendBroadcastMessage) {
    this.syncManager.setSendBroadcastMessage(sendFn)
  }

  public receiveBroadcastedMessage(base64Data: string) {
    this.syncManager.handleReceivedData(base64Data)
  }

  public broadcastFullState() {
    this.syncManager.broadcastFullState()
  }

  public broadcastAwareness() {
    this.syncManager.broadcastAwareness()
  }

  public setLocalAwarenessUser(user: UmlStudio.CollaborationUser) {
    this.syncManager.setLocalAwarenessUser(user)
  }

  public setLocalAwarenessCursor(cursor: UmlStudio.CollaborationCursor | null) {
    this.syncManager.setLocalAwarenessCursor(cursor)
  }

  public setLocalAwarenessSelectedElement(selectedElementId: string | null) {
    this.syncManager.setLocalAwarenessSelectedElement(selectedElementId)
  }

  public setLocalAwarenessState(state: Partial<UmlStudio.CollaborationState>) {
    this.syncManager.setLocalAwarenessState(state)
  }

  public getLocalAwarenessClientId(): number {
    return this.syncManager.getLocalAwarenessClientId()
  }

  public getCollaborators(): UmlStudio.CollaboratorInfo[] {
    return this.syncManager.getCollaborators()
  }

  public setLocalAwarenessFollowing(followingClientId: number | null): void {
    this.syncManager.setLocalAwarenessFollowing(followingClientId)
  }

  public followCollaborator(followingClientId: number | null): void {
    this.syncManager.setLocalAwarenessFollowing(followingClientId)
  }

  public getFollowingClientId(): number | null {
    const localId = this.syncManager.getLocalAwarenessClientId()
    const state = this.syncManager.getAwarenessStates().get(localId)
    return state?.followingClientId ?? null
  }

  public getAwarenessStates(): Map<number, UmlStudio.CollaborationState> {
    return this.syncManager.getAwarenessStates()
  }

  public focusOnCollaborator(clientId: number): boolean {
    const states = this.syncManager.getAwarenessStates()
    const state = states.get(clientId)
    if (state?.viewport && this.reactFlowInstance) {
      this.reactFlowInstance.setViewport(state.viewport, { duration: 300 })
      return true
    }
    if (state?.cursor && this.reactFlowInstance) {
      this.reactFlowInstance.setCenter(state.cursor.x, state.cursor.y, { duration: 300 })
      return true
    }
    return false
  }

  public updateDiagramTitle(name: string) {
    this.metadataStore.getState().updateDiagramTitle(name)
  }

  public setReadonly(readonly: boolean): void {
    this.metadataStore.getState().setReadonly(readonly)
    if (readonly) {
      this.diagramStore.getState().setSelectedElementsId([])
      this.popoverStore.getState().setPopOverElementId(null)
    }
  }

  public undo(): void {
    this.diagramStore.getState().undo()
  }

  public redo(): void {
    this.diagramStore.getState().redo()
  }

  public canUndo(): boolean {
    return this.diagramStore.getState().canUndo
  }

  public canRedo(): boolean {
    return this.diagramStore.getState().canRedo
  }

  public subscribeToUndoRedo(
    callback: (state: { canUndo: boolean; canRedo: boolean }) => void
  ): () => void {
    let prevUndo = this.diagramStore.getState().canUndo
    let prevRedo = this.diagramStore.getState().canRedo
    callback({ canUndo: prevUndo, canRedo: prevRedo })
    return this.diagramStore.subscribe((state) => {
      if (state.canUndo !== prevUndo || state.canRedo !== prevRedo) {
        prevUndo = state.canUndo
        prevRedo = state.canRedo
        callback({ canUndo: state.canUndo, canRedo: state.canRedo })
      }
    })
  }

  public isMultiSelection(): boolean {
    return this.metadataStore.getState().multiSelectionMode
  }

  public setMultiSelectionMode(enabled: boolean): void {
    this.metadataStore.getState().setMultiSelectionMode(enabled)
  }

  public toggleMultiSelection(): void {
    const current = this.metadataStore.getState().multiSelectionMode
    this.metadataStore.getState().setMultiSelectionMode(!current)
  }

  public subscribeToMultiSelection(callback: (enabled: boolean) => void): () => void {
    let prev = this.metadataStore.getState().multiSelectionMode
    callback(prev)
    return this.metadataStore.subscribe((state) => {
      if (state.multiSelectionMode !== prev) {
        prev = state.multiSelectionMode
        callback(state.multiSelectionMode)
      }
    })
  }

  public setLabels(labels: Partial<UmlStudio.UmlStudioLabels>): void {
    this.metadataStore.getState().setLabels(mergeLabels(labels))
  }

  public setMode(mode: UmlStudio.UmlStudioMode): void {
    this.metadataStore.getState().setMode(mode)
  }

  public setScrollLock(scrollLock: boolean): void {
    this.metadataStore.getState().setScrollLock(scrollLock)
  }

  public setKeyboardShortcuts(keyboardShortcuts: boolean): void {
    this.metadataStore.getState().setKeyboardShortcuts(keyboardShortcuts)
  }

  public setTags(options?: boolean | UmlStudio.TagOptions): void {
    this.metadataStore.getState().setTagConfig(resolveTagConfig(options))
  }

  public setElementTags(elementId: string, tags: string[]): void {
    const { nodes, setNodes } = this.diagramStore.getState()
    const next = applyElementTags(nodes, elementId, tags)
    if (next !== nodes) setNodes(next)
  }

  public setPreviewMode(active: boolean): void {
    this.diagramStore.getState().setPreviewMode(active)
    if (!active) {
      this.metadataStore.getState().updateMetaDataFromYjs()
    }
  }

  public toggleInteractiveElementsMode(forceEnabled?: boolean): void {
    const currentView = this.metadataStore.getState().view
    const shouldEnable = forceEnabled ?? currentView !== UmlStudio.UmlStudioView.Highlight

    this.metadataStore
      .getState()
      .setView(shouldEnable ? UmlStudio.UmlStudioView.Highlight : UmlStudio.UmlStudioView.Modelling)
  }

  public getInteractiveForSerialization(): UmlStudio.InteractiveElements | undefined {
    return this.diagramStore.getState().getInteractiveForSerialization()
  }

  public getDiagramMetadata() {
    const { diagramTitle, diagramType } = this.metadataStore.getState()
    return { diagramTitle, diagramType }
  }

  public isReadonly(): boolean {
    return Boolean(this.metadataStore.getState().readonly)
  }

  get model(): UmlStudio.UMLModel {
    const { nodes, edges, diagramId } = this.diagramStore.getState()
    const { diagramTitle, diagramType } = this.metadataStore.getState()
    const interactive = this.getInteractiveForSerialization()
    return {
      id: diagramId,
      version: CURRENT_MODEL_VERSION,
      title: diagramTitle,
      type: diagramType,
      nodes: nodes.map((node) => mapFromReactFlowNodeToUmlStudioNode(node)),
      edges: edges.map((edge) => mapFromReactFlowEdgeToUmlStudioEdge(edge)),
      assessments: this.diagramStore.getState().assessments,
      ...(interactive && { interactive }),
    }
  }

  set model(incoming: UmlStudio.UMLModel) {
    const model = normalizeModel(incoming)
    const { nodes, edges, assessments, interactive } = model
    this.edgeGeometryStore.getState().beginRoutingBootstrap()
    this.diagramStore.getState().setNodesAndEdges(nodes, edges)
    this.diagramStore.getState().setAssessments(assessments)
    this.diagramStore.getState().setInteractive(interactive)
    this.metadataStore.getState().updateMetaData(model.title, parseDiagramType(model.type))
  }

  public setElementHighlights(
    highlights: Map<string, string> | Record<string, string> | null | undefined
  ): void {
    if (highlights === undefined) return
    const record =
      highlights === null
        ? {}
        : Object.fromEntries(highlights instanceof Map ? highlights : Object.entries(highlights))
    this.assessmentSelectionStore.getState().setElementHighlights(record)
  }

  public revealAssessment(elementId: string | null, options?: { reveal?: boolean }): void {
    const { nodes, edges, getAssessment, setLocalSelection } = this.diagramStore.getState()

    if (elementId === null) {
      setLocalSelection([])
      this.assessmentSelectionStore.getState().selectMultipleElements([])
      this.popoverStore.getState().setPopOverElementId(null)
      return
    }

    const owner = nodes.find((node) => assessedIdsFor(node.id, nodes).includes(elementId))
    const targetId = owner?.id ?? elementId
    const element =
      nodes.find((node) => node.id === targetId) ?? edges.find((edge) => edge.id === targetId)

    setLocalSelection([targetId])
    this.assessmentSelectionStore
      .getState()
      .selectMultipleElements(assessedIdsFor(elementId, nodes))
    const { mode, readonly } = this.metadataStore.getState()
    const canOpenFeedback =
      mode === UmlStudio.UmlStudioMode.Assessment &&
      (!readonly || hasAssessmentToShow(targetId, nodes, getAssessment))
    this.popoverStore.getState().setPopOverElementId(canOpenFeedback ? targetId : null)

    if (options?.reveal === false || !element) return

    const rf = this.reactFlowInstance
    if (!rf) return
    const centre = getAssessmentElementCenter(element, nodes, this.edgeGeometryStore.getState())
    if (!centre || !Number.isFinite(centre.x) || !Number.isFinite(centre.y)) return
    const zoom = rf.getZoom()
    if (!Number.isFinite(zoom)) return
    rf.setCenter(centre.x, centre.y, {
      duration: 220,
      zoom,
    })
  }

  public getElementHighlights(): Record<string, string> {
    return { ...this.assessmentSelectionStore.getState().highlightedElements }
  }

  public getElementIdsByTag(tag: string): string[] {
    return getElementIdsByTag(this.diagramStore.getState().nodes, tag)
  }

  public getSelectedElements(): string[] {
    const { mode, readonly } = this.metadataStore.getState()
    if (mode === UmlStudio.UmlStudioMode.Assessment && readonly) {
      return this.assessmentSelectionStore.getState().selectedElementIds
    }
    return this.diagramStore.getState().selectedElementIds
  }

  get view(): UmlStudio.UmlStudioView {
    return this.metadataStore.getState().view
  }

  set view(view: UmlStudio.UmlStudioView) {
    this.metadataStore.getState().setView(view)
  }

  public addOrUpdateAssessment(assessment: UmlStudio.Assessment): void {
    this.diagramStore.getState().addOrUpdateAssessment(assessment)
  }

  public __perf(skipDocumentEncoding = false):
    | {
        encodedDocBytes: number
        nodesMapSize: number
        storeNodeWrites: number
        edgeSearches: number
        edgeSearchExpansions: number
        edgeSearchesMaxExpansions: number
        edgeSearchesAbandoned: number
        edgeSearchMs: number
        edgeSearchMaxMs: number
        edgeSearchSetupMs: number
        edgeSearchLoopMs: number
        edgeStepPricings: number
        edgeHeuristicEvaluations: number
        edgeHeapPushes: number
        edgeIncumbentBounds: number
        edgeBoundPrunes: number
        edgeMaxCells: number
        routeScorePairs: number
        routeScoreMs: number
        routeScoreRuns: number
        solveMs: number
        solveMaxMs: number
        solveCount: number
        workerSolveCount: number
        workerResponseCount: number
        workerAttemptCount: number
        workerFallbackCount: number
        workerInitialSyncCount: number
        workerSmallSyncCount: number
        workerSerializeMaxMs: number
        workerPostMessageMaxMs: number
        workerRoundTripMaxMs: number
        workerDispatchDelayMaxMs: number
        workerSnapshotAgeMaxMs: number
        workerReleaseExactMaxMs: number
        workerReleaseSettledMaxMs: number
        workerHolisticPreviewCount: number
        workerFirstPreviewMaxMs: number
        workerPreviewGapMaxMs: number
        workerLatestInputRevision: number
        workerLastDispatchedRevision: number
        workerLastAcceptedRevision: number
        previewDecisionHoldCount: number
        previewDecisionConfirmCount: number
        previewDecisionInvalidationCount: number
        edgeRenderCount: number
        routingSolving: number
        routingPreviewCount: number
        diagramEdgeCount: number
      }
    | undefined {
    if (!import.meta.env.DEV && import.meta.env.VITE_E2E !== "true") return undefined

    const counters = getPerfCounters()

    return {
      encodedDocBytes: skipDocumentEncoding ? 0 : Y.encodeStateAsUpdate(this.ydoc).byteLength,
      nodesMapSize: getNodesMap(this.ydoc).size,
      storeNodeWrites: counters?.storeNodeWrites ?? 0,
      edgeSearches: counters?.routerSearches ?? 0,
      edgeSearchExpansions: counters?.routerExpansions ?? 0,
      edgeSearchesMaxExpansions: counters?.routerMaxExpansions ?? 0,
      edgeSearchesAbandoned: counters?.routerAbandoned ?? 0,
      edgeSearchMs: counters?.routerSearchMs ?? 0,
      edgeSearchMaxMs: counters?.routerSearchMaxMs ?? 0,
      edgeSearchSetupMs: counters?.routerSetupMs ?? 0,
      edgeSearchLoopMs: counters?.routerLoopMs ?? 0,
      edgeStepPricings: counters?.routerStepPricings ?? 0,
      edgeHeuristicEvaluations: counters?.routerHeuristicEvaluations ?? 0,
      edgeHeapPushes: counters?.routerHeapPushes ?? 0,
      edgeIncumbentBounds: counters?.routerIncumbentBounds ?? 0,
      edgeBoundPrunes: counters?.routerBoundPrunes ?? 0,
      edgeMaxCells: counters?.routerMaxCells ?? 0,
      routeScorePairs: counters?.routeScorePairs ?? 0,
      routeScoreMs: counters?.routeScoreMs ?? 0,
      routeScoreRuns: counters?.routeScoreRuns ?? 0,
      solveMs: counters?.solveMs ?? 0,
      solveMaxMs: counters?.solveMaxMs ?? 0,
      solveCount: counters?.solveCount ?? 0,
      workerSolveCount: counters?.workerSolveCount ?? 0,
      workerResponseCount: counters?.workerResponseCount ?? 0,
      workerAttemptCount: counters?.workerAttemptCount ?? 0,
      workerFallbackCount: counters?.workerFallbackCount ?? 0,
      workerInitialSyncCount: counters?.workerInitialSyncCount ?? 0,
      workerSmallSyncCount: counters?.workerSmallSyncCount ?? 0,
      workerSerializeMaxMs: counters?.workerSerializeMaxMs ?? 0,
      workerPostMessageMaxMs: counters?.workerPostMessageMaxMs ?? 0,
      workerRoundTripMaxMs: counters?.workerRoundTripMaxMs ?? 0,
      workerDispatchDelayMaxMs: counters?.workerDispatchDelayMaxMs ?? 0,
      workerSnapshotAgeMaxMs: counters?.workerSnapshotAgeMaxMs ?? 0,
      workerReleaseExactMaxMs: counters?.workerReleaseExactMaxMs ?? 0,
      workerReleaseSettledMaxMs: counters?.workerReleaseSettledMaxMs ?? 0,
      workerHolisticPreviewCount: counters?.workerHolisticPreviewCount ?? 0,
      workerFirstPreviewMaxMs: counters?.workerFirstPreviewMaxMs ?? 0,
      workerPreviewGapMaxMs: counters?.workerPreviewGapMaxMs ?? 0,
      workerLatestInputRevision: counters?.workerLatestInputRevision ?? 0,
      workerLastDispatchedRevision: counters?.workerLastDispatchedRevision ?? 0,
      workerLastAcceptedRevision: counters?.workerLastAcceptedRevision ?? 0,
      previewDecisionHoldCount: counters?.previewDecisionHoldCount ?? 0,
      previewDecisionConfirmCount: counters?.previewDecisionConfirmCount ?? 0,
      previewDecisionInvalidationCount: counters?.previewDecisionInvalidationCount ?? 0,
      edgeRenderCount: counters?.edgeRenderCount ?? 0,
      routingSolving: this.edgeGeometryStore.getState().isSolving ? 1 : 0,
      routingPreviewCount: Object.keys(this.edgeGeometryStore.getState().previewById).length,
      diagramEdgeCount: this.diagramStore.getState().edges.length,
    }
  }

  static generateInitialSyncMessage(): string {
    return YjsSync.uint8ToBase64(new Uint8Array([MessageType.YjsSYNC]))
  }

  static generateInitialAwarenessSyncMessage(): string {
    return YjsSync.uint8ToBase64(new Uint8Array([MessageType.AwarenessSync]))
  }
}
