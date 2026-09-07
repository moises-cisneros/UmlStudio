import {
  ReactFlowProvider,
  ReactFlowInstance,
  ConnectionMode,
  ReactFlow,
} from "@xyflow/react"
import { useCallback } from "react"
import {
  CustomBackground,
  AssessmentSelectionDebug,
  ScrollOverlay,
  AlignmentGuides,
} from "@/components"
import { ConnectionPreviewLine } from "@/components/ConnectionPreviewLine"
import { ArcScalePublisher } from "@/components/ArcScalePublisher"
import { OverlayLayer } from "@/overlay/OverlayLayer"
import "@xyflow/react/dist/style.css"
import "../../ui/dist/components.css"
import "@/styles/fonts.css"
import "@/styles/app.css"
import {
  useDiagramStore,
  useEdgeGeometryStore,
  useMetadataStore,
  useOverlayStore,
} from "./store/context"
import { useShallow } from "zustand/shallow"
import { type CSSProperties } from "react"
import { CANVAS } from "./constants"
import { diagramEdgeTypes } from "./edges"
import {
  useNodeDragStop,
  useConnect,
  useElementInteractions,
  useDragOver,
  useNodeDrag,
} from "./hooks"
import { diagramNodeTypes } from "./nodes"
import { useDiagramModifiable } from "./hooks/useDiagramModifiable"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useKeyboardScope } from "./hooks/useKeyboardScope"
import { useMultiSelectionMode } from "./hooks/useMultiSelectionMode"
import { usePaneClicked } from "./hooks/usePaneClicked"
import {
  useRemoteDraggingNodes,
  applyDraggingOverlay,
} from "./hooks/useRemoteDraggingNodes"
import { getConnectionLineType } from "./utils/edgeUtils"
import { applyAssessmentFocus } from "./utils/assessmentFocus"
import { usePopoverStore } from "@/store/context"
import { UmlStudioMode } from "./typings"
import {
  CollaborationLayer,
  type CollaborationAwarenessApi,
  type CollaborationLayerOptions,
} from "@/components/collaboration/CollaborationLayer"
import { TooltipProvider } from "@/components/ui"
import { EdgeGeometrySolver } from "@/components/EdgeGeometrySolver"
import {
  UmlStudioPortalContainerProvider,
  UmlStudioPortalRoot,
} from "@/components/ui/portalContainer"

interface AppProps {
  onReactFlowInit: (instance: ReactFlowInstance) => void
  collaboration: CollaborationLayerOptions
  awareness: CollaborationAwarenessApi
  onlyRenderVisibleElements?: boolean
}
const proOptions = { hideAttribution: true }
function App({
  onReactFlowInit,
  collaboration,
  awareness,
  onlyRenderVisibleElements = true,
}: AppProps) {
  const { nodes, onNodesChange, edges, onEdgesChange, diagramId, previewMode } =
    useDiagramStore(
      useShallow((state) => ({
        nodes: state.nodes,
        onNodesChange: state.onNodesChange,
        edges: state.edges,
        onEdgesChange: state.onEdgesChange,
        diagramId: state.diagramId,
        previewMode: state.previewMode,
      }))
    )

  const {
    diagramType,
    mode,
    readonly,
    scrollLock,
    scrollEnabled,
    keyboardShortcuts,
    connectionGuidanceActive,
  } = useMetadataStore(
    useShallow((state) => ({
      diagramType: state.diagramType,
      mode: state.mode,
      readonly: state.readonly,
      scrollLock: state.scrollLock,
      scrollEnabled: state.scrollEnabled,
      keyboardShortcuts: state.keyboardShortcuts,
      connectionGuidanceActive: state.connectionGuidanceActive,
    }))
  )

  const isDiagramModifiable = useDiagramModifiable()

  const insets = useOverlayStore((state) => state.insets)

  const remoteDraggingNodes = useRemoteDraggingNodes(
    awareness,
    collaboration.enabled && !previewMode
  )
  const openPopoverElementId = usePopoverStore(
    (state) => state.popoverElementId
  )
  const assessedElementId =
    mode === UmlStudioMode.Assessment ? openPopoverElementId : null
  const displayNodes = applyAssessmentFocus(
    applyDraggingOverlay(nodes, remoteDraggingNodes),
    assessedElementId
  )
  const displayEdges = applyAssessmentFocus(edges, assessedElementId)

  const connectionLineType = getConnectionLineType(diagramType)
  const onNodeDragStop = useNodeDragStop()
  const onNodeDrag = useNodeDrag()
  const onDragOver = useDragOver()
  const { onConnect, onConnectEnd, onConnectStart, onEdgesDelete } =
    useConnect()
  const {
    onBeforeDelete,
    onNodeClick,
    onEdgeClick,
    onNodeDoubleClick,
    onEdgeDoubleClick,
  } = useElementInteractions()
  const { onPaneClicked } = usePaneClicked()
  const multiSelectionMode = useMultiSelectionMode()
  const routingReady = useEdgeGeometryStore((state) => state.routingReady)
  const {
    rootRef,
    active: keyboardScopeActive,
    rootHandlers,
  } = useKeyboardScope(keyboardShortcuts)
  useKeyboardShortcuts(rootRef)

  const handleReactFlowInit = useCallback(
    (instance: ReactFlowInstance) => {
      onReactFlowInit(instance)
    },
    [onReactFlowInit]
  )

  return (
    <TooltipProvider>
      <div
        ref={rootRef}
        tabIndex={-1}
        {...rootHandlers}
        className={`umlstudio-editor ${readonly ? "umlstudio-editor--readonly" : ""} ${
          mode === UmlStudioMode.Assessment ? "umlstudio-editor--assessment" : ""
        } ${
          connectionGuidanceActive ? "umlstudio-editor--connection-guidance" : ""
        }`}
        style={
          {
            display: "flex",
            height: "100%",
            width: "100%",
            overflow: "hidden",
            backgroundColor: "var(--umlstudio-background, #ffffff)",
            position: "relative",
            "--umlstudio-inset-top": `${insets.top}px`,
            "--umlstudio-inset-right": `${insets.right}px`,
            "--umlstudio-inset-bottom": `${insets.bottom}px`,
            "--umlstudio-inset-left": `${insets.left}px`,
          } as CSSProperties
        }
      >
        <div className="umlstudio-canvas">
          <ReactFlow
            id={`react-flow-library-${diagramId}`}
            className="umlstudio-container"
            nodeTypes={diagramNodeTypes}
            edgeTypes={diagramEdgeTypes}
            nodes={displayNodes}
            edges={routingReady ? displayEdges : []}
            onlyRenderVisibleElements={
              routingReady ? onlyRenderVisibleElements : false
            }
            onDragOver={onDragOver}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnectStart={onConnectStart}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onConnectEnd={onConnectEnd}
            zoomOnDoubleClick={false}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            connectionLineType={connectionLineType}
            connectionLineComponent={ConnectionPreviewLine}
            connectionMode={ConnectionMode.Loose}
            elevateEdgesOnSelect
            onInit={(instance: ReactFlowInstance) => {
              if (instance.getNodes().length > 0) {
                instance.fitView({ maxZoom: 1.0, minZoom: 1.0 })
              }
              handleReactFlowInit(instance)
            }}
            minZoom={CANVAS.MIN_SCALE_TO_ZOOM_OUT}
            maxZoom={CANVAS.MAX_SCALE_TO_ZOOM_IN}
            snapToGrid
            snapGrid={[CANVAS.SNAP_TO_GRID_PX, CANVAS.SNAP_TO_GRID_PX]}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onBeforeDelete={onBeforeDelete}
            onPaneClick={onPaneClicked}
            proOptions={proOptions}
            edgesReconnectable={false}
            nodesConnectable={isDiagramModifiable}
            nodesDraggable={isDiagramModifiable}
            panOnScroll={!scrollLock || scrollEnabled}
            zoomOnScroll={!scrollLock || scrollEnabled}
            preventScrolling={!scrollLock || scrollEnabled}
            selectNodesOnDrag={!multiSelectionMode}
            selectionOnDrag={multiSelectionMode}
            panOnDrag={multiSelectionMode ? [1, 2] : true}
            deleteKeyCode={null}
            disableKeyboardA11y={!keyboardScopeActive}
            selectionKeyCode={keyboardScopeActive ? "Shift" : null}
            multiSelectionKeyCode={
              keyboardScopeActive ? ["Shift", "Meta", "Control"] : null
            }
            panActivationKeyCode={keyboardScopeActive ? "Space" : null}
            zoomActivationKeyCode={
              keyboardScopeActive ? ["Meta", "Control"] : null
            }
          >
            <CustomBackground />
            <ArcScalePublisher />
            <AlignmentGuides />
            <AssessmentSelectionDebug />
            <EdgeGeometrySolver />
                        <OverlayLayer />
          </ReactFlow>
          <ScrollOverlay />
          <CollaborationLayer options={collaboration} awareness={awareness} />
        </div>
        <UmlStudioPortalRoot />
      </div>
    </TooltipProvider>
  )
}

export function AppWithProvider(props: AppProps) {
  return (
    <ReactFlowProvider>
      <UmlStudioPortalContainerProvider>
        <App {...props} />
      </UmlStudioPortalContainerProvider>
    </ReactFlowProvider>
  )
}
