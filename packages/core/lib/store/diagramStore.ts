import { create, StoreApi, UseBoundStore } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import {
  applyNodeChanges,
  getConnectedEdges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyEdgeChanges,
} from "@xyflow/react";
import * as Y from "yjs";
import { sortNodesTopologically } from "@/utils";
import {
  getNodesMap,
  getEdgesMap,
  getAssessments,
  reconcileYMap,
  STORE_ORIGIN,
} from "@/sync/ydoc";
import { recordStoreNodeWrite } from "@/sync/perfCounters";
import { deepEqual } from "@/utils/storeUtils";
import { Assessment, DraggingNode, InteractiveElements } from "@/typings";
import {
  getNestedNodeElementIds,
  pruneInteractiveElements,
  toggleInteractiveRecord,
} from "@/utils/interactiveUtils";

type InitialDiagramState = {
  nodes: Node[];
  edges: Edge[];
  selectedElementIds: string[];
  diagramId: string;
  assessments: Record<string, Assessment>;
  interactiveElements: Record<string, boolean>;
  interactiveRelationships: Record<string, boolean>;
  interactiveSelectionInitialized: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoManager: Y.UndoManager | null;
  collaborationEnabled: boolean;
  previewMode: boolean;
  lastPlacedElementId: string | null;
};

const initialDiagramState: InitialDiagramState = {
  nodes: [],
  edges: [],
  selectedElementIds: [],
  diagramId: Math.random().toString(36).substring(2, 15),
  assessments: {},
  interactiveElements: {},
  interactiveRelationships: {},
  interactiveSelectionInitialized: false,
  canUndo: false,
  canRedo: false,
  undoManager: null,
  collaborationEnabled: false,
  previewMode: false,
  lastPlacedElementId: null,
};

function stripComputedSegmentsFromEdge(edge: Edge): Edge {
  if (
    !edge.data ||
    !Object.prototype.hasOwnProperty.call(edge.data, "computedSegments")
  ) {
    return edge;
  }

  const data = { ...(edge.data as Record<string, unknown>) };
  delete data.computedSegments;
  return { ...edge, data };
}

function stripComputedSegmentsFromEdges(edges: Edge[]): Edge[] {
  return edges.map(stripComputedSegmentsFromEdge);
}

function stripSelected(node: Node): Node {
  const persisted = { ...node };
  delete persisted.selected;
  return persisted;
}

function nodeEntriesForPersistence(nodes: Node[]): Array<[string, Node]> {
  return nodes.map((node) => [node.id, stripSelected(node)]);
}

export type DiagramStore = {
  nodes: Node[];
  edges: Edge[];
  selectedElementIds: string[];
  diagramId: string;
  assessments: Record<string, Assessment>;
  interactiveElements: Record<string, boolean>;
  interactiveRelationships: Record<string, boolean>;
  interactiveSelectionInitialized: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoManager: Y.UndoManager | null;
  collaborationEnabled: boolean;
  previewMode: boolean;
  lastPlacedElementId: string | null;
  setLastPlacedElementId: (id: string | null) => void;
  setDiagramId: (diagramId: string) => void;
  setCollaborationEnabled: (enabled: boolean) => void;
  setDraggingNodesPublisher: (
    publisher: ((draggingNodes: DraggingNode[] | null) => void) | null,
  ) => void;
  endTransientNodeBroadcast: () => void;
  setNodes: (payload: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (payload: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  setNodesAndEdges: (nodes: Node[], edges: Edge[]) => void;
  addEdge: (edge: Edge) => void;
  addNode: (node: Node) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  reset: () => void;
  setSelectedElementsId: (
    payload: string[] | ((edges: string[]) => string[]),
  ) => void;
  setLocalSelection: (elementIds: string[]) => void;
  getAssessment: (id: string) => Assessment | undefined;
  setAssessments: (
    assessments:
      | Record<string, Assessment>
      | ((prev: Record<string, Assessment>) => Record<string, Assessment>),
  ) => void;
  updateNodesFromYjs: () => void;
  updateEdgesFromYjs: () => void;
  updateAssessmentFromYjs: () => void;
  addOrUpdateAssessment: (assessment: Assessment) => void;
  undo: () => void;
  redo: () => void;
  initializeUndoManager: () => void;
  updateUndoRedoState: () => void;
  toggleInteractiveElement: (elementId: string) => void;
  getInteractiveForSerialization: () => InteractiveElements | undefined;
  setInteractive: (interactive: InteractiveElements | undefined) => void;
  isElementInteractive: (elementId: string) => boolean;
  setPreviewMode: (active: boolean) => void;
};

export const createDiagramStore = (
  ydoc: Y.Doc,
): UseBoundStore<StoreApi<DiagramStore>> =>
  create<DiagramStore>()(
    devtools(
      subscribeWithSelector((set, get) => {
        const transactStore = (fn: () => void) => {
          if (get().previewMode) return;
          ydoc.transact(fn, STORE_ORIGIN);
        };

        let draggingNodesPublisher:
          | ((draggingNodes: DraggingNode[] | null) => void)
          | null = null;
        let wasPublishingTransient = false;

        return {
          ...initialDiagramState,

          initializeUndoManager: () => {
            const nodesMap = getNodesMap(ydoc);
            const edgesMap = getEdgesMap(ydoc);
            const assessmentsMap = getAssessments(ydoc);

            const undoManager = new Y.UndoManager(
              [nodesMap, edgesMap, assessmentsMap],
              {
                captureTimeout: 500,
                trackedOrigins: new Set([STORE_ORIGIN]),
              },
            );

            const captureSelection = ({
              stackItem,
            }: {
              stackItem: Y.UndoManager["undoStack"][number];
            }) => {
              stackItem.meta.set(
                "selectedElementIds",
                get().selectedElementIds,
              );
              get().updateUndoRedoState();
            };
            undoManager.on("stack-item-added", captureSelection);
            undoManager.on("stack-item-updated", captureSelection);

            undoManager.on("stack-item-popped", ({ stackItem }) => {
              const ids = stackItem.meta.get("selectedElementIds");
              if (Array.isArray(ids)) get().setLocalSelection(ids);
              get().updateUndoRedoState();
            });

            undoManager.on("stack-cleared", () => {
              get().updateUndoRedoState();
            });

            set({ undoManager }, undefined, "initializeUndoManager");
            get().updateUndoRedoState();
          },

          updateUndoRedoState: () => {
            const { undoManager } = get();
            if (!undoManager) return;

            set(
              {
                canUndo: undoManager.undoStack.length > 0,
                canRedo: undoManager.redoStack.length > 0,
              },
              undefined,
              "updateUndoRedoState",
            );
          },

          undo: () => {
            if (get().previewMode) return;
            const { undoManager } = get();
            if (!undoManager || !undoManager.canUndo()) return;

            undoManager.undo();
          },

          redo: () => {
            if (get().previewMode) return;
            const { undoManager } = get();
            if (!undoManager || !undoManager.canRedo()) return;

            undoManager.redo();
          },

          setDiagramId: (diagramId) => {
            set({ diagramId }, undefined, "setDiagramId");
          },

          setCollaborationEnabled: (enabled) => {
            if (!enabled) get().endTransientNodeBroadcast();
            set(
              { collaborationEnabled: enabled },
              undefined,
              "setCollaborationEnabled",
            );
          },

          setDraggingNodesPublisher: (publisher) => {
            draggingNodesPublisher = publisher;
          },

          endTransientNodeBroadcast: () => {
            if (draggingNodesPublisher && wasPublishingTransient) {
              draggingNodesPublisher(null);
              wasPublishingTransient = false;
            }
          },

          setSelectedElementsId: (payload) => {
            const selectedElementIds =
              typeof payload === "function"
                ? payload(get().selectedElementIds)
                : payload;

            set({ selectedElementIds }, undefined, "setSelectedElementsId");
          },

          setLocalSelection: (elementIds) => {
            const selectedIds = new Set(elementIds);
            set(
              (state) => ({
                selectedElementIds: elementIds,
                nodes: state.nodes.map((node) =>
                  (node.selected ?? false) === selectedIds.has(node.id)
                    ? node
                    : { ...node, selected: selectedIds.has(node.id) },
                ),
                edges: state.edges.map((edge) =>
                  (edge.selected ?? false) === selectedIds.has(edge.id)
                    ? edge
                    : { ...edge, selected: selectedIds.has(edge.id) },
                ),
              }),
              undefined,
              "setLocalSelection",
            );
          },

          setLastPlacedElementId: (id) => {
            set(
              { lastPlacedElementId: id },
              undefined,
              "setLastPlacedElementId",
            );
          },

          toggleInteractiveElement: (elementId) => {
            const isNode = get().nodes.some((node) => node.id === elementId);
            const isNestedNodeElement = getNestedNodeElementIds(
              get().nodes,
            ).has(elementId);
            const isEdge = get().edges.some((edge) => edge.id === elementId);

            if (!isNode && !isNestedNodeElement && !isEdge) {
              return;
            }

            set(
              (state) => ({
                interactiveElements:
                  isNode || isNestedNodeElement
                    ? toggleInteractiveRecord(
                        state.interactiveElements,
                        elementId,
                      )
                    : state.interactiveElements,
                interactiveRelationships: isEdge
                  ? toggleInteractiveRecord(
                      state.interactiveRelationships,
                      elementId,
                    )
                  : state.interactiveRelationships,
                interactiveSelectionInitialized: true,
              }),
              undefined,
              "toggleInteractiveElement",
            );
          },

          getInteractiveForSerialization: () => {
            const interactive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              get().nodes,
              get().edges,
            );
            return (
              interactive ??
              (get().interactiveSelectionInitialized
                ? { elements: {}, relationships: {} }
                : undefined)
            );
          },

          setInteractive: (interactive) => {
            const prunedInteractive = pruneInteractiveElements(
              interactive,
              get().nodes,
              get().edges,
            );

            set(
              {
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
                interactiveSelectionInitialized: interactive !== undefined,
              },
              undefined,
              "setInteractive",
            );
          },

          isElementInteractive: (elementId) => {
            return !!(
              get().interactiveElements[elementId] ||
              get().interactiveRelationships[elementId]
            );
          },

          addNode: (node) => {
            transactStore(() => {
              getNodesMap(ydoc).set(node.id, node);
            });
            set({ nodes: [...get().nodes, node] }, undefined, "addNode");
          },

          addEdge: (edge) => {
            const persistedEdge = stripComputedSegmentsFromEdge(edge);
            transactStore(() => {
              getEdgesMap(ydoc).set(persistedEdge.id, persistedEdge);
            });
            set(
              { edges: [...get().edges, persistedEdge] },
              undefined,
              "addEdge",
            );
          },
          setNodes: (payload) => {
            const nodes =
              typeof payload === "function" ? payload(get().nodes) : payload;

            if (deepEqual(get().nodes, nodes)) {
              return;
            }

            transactStore(() => {
              reconcileYMap(
                getNodesMap(ydoc),
                nodeEntriesForPersistence(nodes),
              );
            });
            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              nodes,
              get().edges,
            );
            set(
              {
                nodes,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "setNodes",
            );
          },

          setEdges: (payload) => {
            const edges =
              typeof payload === "function" ? payload(get().edges) : payload;
            const persistedEdges = stripComputedSegmentsFromEdges(edges);

            if (deepEqual(get().edges, persistedEdges)) {
              return;
            }
            transactStore(() => {
              reconcileYMap(
                getEdgesMap(ydoc),
                persistedEdges.map((edge) => [edge.id, edge]),
              );
            });
            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              get().nodes,
              persistedEdges,
            );
            set(
              {
                edges: persistedEdges,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "setEdges",
            );
          },

          setNodesAndEdges: (nodes, edges) => {
            const persistedEdges = stripComputedSegmentsFromEdges(edges);
            transactStore(() => {
              reconcileYMap(
                getNodesMap(ydoc),
                nodeEntriesForPersistence(nodes),
              );
              reconcileYMap(
                getEdgesMap(ydoc),
                persistedEdges.map((edge) => [edge.id, edge]),
              );
            });
            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              nodes,
              persistedEdges,
            );
            set(
              {
                nodes,
                edges: persistedEdges,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "setNodesAndEdges",
            );
          },

          onNodesChange: (changes) => {
            const selectChanges = changes.filter(
              (change) => change.type === "select",
            );

            if (selectChanges.length > 0) {
              selectChanges.forEach((change) => {
                if (change.selected) {
                  set(
                    (state) => ({
                      selectedElementIds: [
                        ...state.selectedElementIds,
                        change.id,
                      ],
                    }),
                    undefined,
                    "onNodesChange-select",
                  );
                } else {
                  set(
                    (state) => ({
                      selectedElementIds: state.selectedElementIds.filter(
                        (id) => id !== change.id,
                      ),
                    }),
                    undefined,
                    "onNodesChange-deselect",
                  );
                }
                set(
                  (state) => ({
                    nodes: state.nodes.map((node) =>
                      node.id === change.id
                        ? { ...node, selected: change.selected }
                        : node,
                    ),
                  }),
                  undefined,
                  "onNodesChange-select-deselect-sync",
                );
              });
            }

            const filteredChanges = changes.filter(
              (change) => change.type !== "select",
            );

            if (filteredChanges.length === 0) return;
            const currentNodes = get().nodes;

            const nextNodes = applyNodeChanges(filteredChanges, currentNodes);

            const gestureInFlight = nextNodes.some(
              (n) => n.dragging || n.resizing,
            );

            let publishedLiveFrames = false;
            if (
              get().collaborationEnabled &&
              !get().previewMode &&
              draggingNodesPublisher
            ) {
              const draggingNodes: DraggingNode[] = [];
              for (const change of filteredChanges) {
                if (change.type === "position" && change.dragging === true) {
                  const node = nextNodes.find((n) => n.id === change.id);
                  if (node)
                    draggingNodes.push({
                      id: node.id,
                      position: node.position,
                    });
                } else if (
                  (change.type === "dimensions" && change.resizing === true) ||
                  (change.type === "replace" && gestureInFlight)
                ) {
                  const id =
                    change.type === "replace" ? change.item.id : change.id;
                  const node = nextNodes.find((n) => n.id === id);
                  if (node)
                    draggingNodes.push({
                      id: node.id,
                      position: node.position,
                      width: node.width ?? null,
                      height: node.height ?? null,
                    });
                }
              }
              if (draggingNodes.length > 0) {
                draggingNodesPublisher(draggingNodes);
                wasPublishingTransient = true;
                publishedLiveFrames = true;
              }
            }

            if (deepEqual(currentNodes, nextNodes)) {
              return;
            }

            const resizeSettled = filteredChanges.some(
              (c) => c.type === "dimensions" && c.resizing === false,
            );

            transactStore(() => {
              for (const change of filteredChanges) {
                if (change.type === "add" || change.type === "replace") {
                  if (change.type === "replace" && gestureInFlight) continue;
                  getNodesMap(ydoc).set(
                    change.item.id,
                    stripSelected(change.item),
                  );
                  recordStoreNodeWrite();
                } else if (change.type === "remove") {
                  set(
                    (state) => ({
                      selectedElementIds: state.selectedElementIds.filter(
                        (id) => id !== change.id,
                      ),
                    }),
                    undefined,
                    "onNodesChange-remove-selectedElementIds",
                  );
                  const deletedNode = getNodesMap(ydoc).get(change.id);
                  if (deletedNode) {
                    const connectedEdges = getConnectedEdges(
                      [deletedNode],
                      get().edges,
                    );
                    getNodesMap(ydoc).delete(change.id);
                    connectedEdges.forEach((edge) =>
                      getEdgesMap(ydoc).delete(edge.id),
                    );
                  }
                } else {
                  const isTransient =
                    (change.type === "position" && change.dragging === true) ||
                    (change.type === "dimensions" && change.resizing === true);
                  if (isTransient) continue;
                  const node = nextNodes.find((n) => n.id === change.id);
                  if (node) {
                    getNodesMap(ydoc).set(change.id, stripSelected(node));
                    recordStoreNodeWrite();
                  }
                }
              }

              if (resizeSettled) {
                reconcileYMap(
                  getNodesMap(ydoc),
                  nodeEntriesForPersistence(nextNodes),
                );
              }
            });
            const hasRemovals = filteredChanges.some(
              (c) => c.type === "remove",
            );
            const currentInteractiveElements = get().interactiveElements;
            const currentInteractiveRelationships =
              get().interactiveRelationships;

            let nextInteractiveElements = currentInteractiveElements;
            let nextInteractiveRelationships = currentInteractiveRelationships;

            if (hasRemovals) {
              const prunedInteractive = pruneInteractiveElements(
                {
                  elements: currentInteractiveElements,
                  relationships: currentInteractiveRelationships,
                },
                nextNodes,
                get().edges,
              );
              nextInteractiveElements = prunedInteractive?.elements ?? {};
              nextInteractiveRelationships =
                prunedInteractive?.relationships ?? {};
            }

            set(
              {
                nodes: nextNodes,
                interactiveElements: nextInteractiveElements,
                interactiveRelationships: nextInteractiveRelationships,
              },
              undefined,
              "onNodesChange",
            );

            if (get().collaborationEnabled && !publishedLiveFrames) {
              get().endTransientNodeBroadcast();
            }
          },

          onEdgesChange: (changes) => {
            const selectChanges = changes.filter(
              (change) => change.type === "select",
            );
            if (selectChanges.length > 0) {
              selectChanges.forEach((change) => {
                if (change.selected) {
                  set(
                    (state) => ({
                      selectedElementIds: [
                        ...state.selectedElementIds,
                        change.id,
                      ],
                    }),
                    undefined,
                    "onEdgesChange-select",
                  );
                } else {
                  set(
                    (state) => ({
                      selectedElementIds: state.selectedElementIds.filter(
                        (id) => id !== change.id,
                      ),
                    }),
                    undefined,
                    "onEdgesChange-deselect",
                  );
                }
                set(
                  (state) => ({
                    edges: state.edges.map((edge) =>
                      edge.id === change.id
                        ? { ...edge, selected: change.selected }
                        : edge,
                    ),
                  }),
                  undefined,
                  "onEdgesChange-select-deselect-sync",
                );
              });
            }

            const changesWithoutSelect = changes.filter(
              (change) => change.type !== "select",
            );

            if (changesWithoutSelect.length === 0) return;

            const currentEdges = get().edges;
            const nextEdges = applyEdgeChanges(
              changesWithoutSelect,
              currentEdges,
            );
            const persistedNextEdges =
              stripComputedSegmentsFromEdges(nextEdges);
            if (deepEqual(currentEdges, persistedNextEdges)) {
              return;
            }

            transactStore(() => {
              for (const change of changes) {
                if (change.type === "add" || change.type === "replace") {
                  const persistedEdge = stripComputedSegmentsFromEdge(
                    change.item,
                  );
                  getEdgesMap(ydoc).set(persistedEdge.id, persistedEdge);
                } else if (change.type === "remove") {
                  set(
                    (state) => ({
                      selectedElementIds: state.selectedElementIds.filter(
                        (id) => id !== change.id,
                      ),
                    }),
                    undefined,
                    "onEdgesChange-remove",
                  );
                  getEdgesMap(ydoc).delete(change.id);
                }
              }
            });
            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              get().nodes,
              persistedNextEdges,
            );

            set(
              {
                edges: persistedNextEdges,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "onEdgesChange",
            );
          },

          reset: () => {
            const { undoManager } = get();
            if (undoManager) {
              undoManager.clear();
            }
            set(initialDiagramState, undefined, "reset");
          },

          updateNodesFromYjs: () => {
            const preserveSelectedNodesAfterYdoc = sortNodesTopologically(
              Array.from(getNodesMap(ydoc).values()),
            ).map((node) => {
              const currentNode = get().nodes.find((n) => n.id === node.id);
              if (currentNode) {
                return { ...node, selected: currentNode.selected };
              } else {
                return node;
              }
            });

            const removedNodes = get().nodes.filter(
              (node) =>
                !preserveSelectedNodesAfterYdoc.some((n) => n.id === node.id),
            );
            if (removedNodes.length > 0) {
              set(
                (state) => ({
                  selectedElementIds: state.selectedElementIds.filter(
                    (id) =>
                      !removedNodes.some(
                        (removedNode) => removedNode.id === id,
                      ),
                  ),
                }),
                undefined,
                "updateNodesFromYjs-selection-remove",
              );
            }

            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              preserveSelectedNodesAfterYdoc,
              get().edges,
            );

            set(
              {
                nodes: preserveSelectedNodesAfterYdoc,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "updateNodesFromYjs",
            );
          },

          updateEdgesFromYjs: () => {
            const preserveSelectedEdgesAfterYdoc = Array.from(
              getEdgesMap(ydoc).values(),
            ).map((edge) => {
              const currentEdge = get().edges.find((e) => e.id === edge.id);
              if (currentEdge) {
                return stripComputedSegmentsFromEdge({
                  ...edge,
                  selected: currentEdge.selected,
                });
              } else {
                return stripComputedSegmentsFromEdge(edge);
              }
            });

            const removedEdges = get().edges.filter(
              (edge) =>
                !preserveSelectedEdgesAfterYdoc.some((e) => e.id === edge.id),
            );
            if (removedEdges.length > 0) {
              set(
                (state) => ({
                  selectedElementIds: state.selectedElementIds.filter(
                    (id) =>
                      !removedEdges.some(
                        (removedEdge) => removedEdge.id === id,
                      ),
                  ),
                }),
                undefined,
                "updateEdgesFromYjs-selection-remove",
              );
            }

            const prunedInteractive = pruneInteractiveElements(
              {
                elements: get().interactiveElements,
                relationships: get().interactiveRelationships,
              },
              get().nodes,
              preserveSelectedEdgesAfterYdoc,
            );

            set(
              {
                edges: preserveSelectedEdgesAfterYdoc,
                interactiveElements: prunedInteractive?.elements ?? {},
                interactiveRelationships:
                  prunedInteractive?.relationships ?? {},
              },
              undefined,
              "updateEdgesFromYjs",
            );
          },

          setAssessments: (payload) => {
            const assessments =
              typeof payload === "function"
                ? payload(get().assessments)
                : payload;

            transactStore(() => {
              reconcileYMap(getAssessments(ydoc), Object.entries(assessments));
            });

            set({ assessments }, undefined, "setAssessments");
          },

          updateAssessmentFromYjs: () => {
            const yMap = getAssessments(ydoc);
            const assessments: Record<string, Assessment> = {};

            yMap.forEach((value, key) => {
              assessments[key] = value;
            });

            set({ assessments }, undefined, "updateAssessmentFromYjs");
          },

          getAssessment: (id) => {
            return get().assessments[id];
          },

          setPreviewMode: (active) => {
            const wasActive = get().previewMode;
            if (active === wasActive) return;
            set({ previewMode: active }, undefined, "setPreviewMode");
            if (!active) {
              get().updateNodesFromYjs();
              get().updateEdgesFromYjs();
              get().updateAssessmentFromYjs();
            }
          },

          addOrUpdateAssessment: (assessment) => {
            transactStore(() => {
              getAssessments(ydoc).set(assessment.modelElementId, assessment);
            });
            set(
              (state) => ({
                assessments: {
                  ...state.assessments,
                  [assessment.modelElementId]: assessment,
                },
              }),
              undefined,
              "addOrUpdateAssessment",
            );
          },
        };
      }),
      { name: "DiagramStore", enabled: true },
    ),
  );
