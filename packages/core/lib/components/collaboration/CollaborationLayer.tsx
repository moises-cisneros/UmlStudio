import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOnViewportChange, useReactFlow, useViewport } from "@xyflow/react";
import { useShallow } from "zustand/shallow";
import { useDiagramStore } from "@/store";
import {
  CollaborationCursor,
  CollaborationState,
  CollaborationUser,
  CollaborationViewport,
  CollaboratorInfo,
} from "@/typings";
import { flowToCanvasPosition } from "./coordinates";

export type CollaborationAwarenessApi = {
  setLocalAwarenessCursor: (cursor: CollaborationCursor | null) => void;
  setLocalAwarenessSelectedElement: (selectedElementId: string | null) => void;
  setLocalAwarenessViewport: (viewport: CollaborationViewport | null) => void;
  setLocalAwarenessFollowing: (followingClientId: number | null) => void;
  getAwarenessStates: () => Map<number, CollaborationState>;
  subscribeToAwarenessChanges: (
    callback: (states: Map<number, CollaborationState>) => void,
  ) => () => void;
  subscribeToCollaboratorChanges: (
    callback: (collaborators: CollaboratorInfo[]) => void,
  ) => () => void;
  getLocalAwarenessClientId: () => number;
};

export type CollaborationLayerOptions = {
  enabled: boolean;
  user?: CollaborationUser;
  showPresence: boolean;
  showCursors: boolean;
  showSelectionHighlights: boolean;
  showFollow: boolean;
};

type CollaborationLayerProps = {
  options: CollaborationLayerOptions;
  awareness: CollaborationAwarenessApi;
};

type RemoteCursor = {
  clientId: number;
  name: string;
  color: string;
  x: number;
  y: number;
};

type FollowTarget = {
  clientId: number;
  name: string;
  color: string;
};

const cssEscape = (value: string) => {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
};

const getElementTargets = (container: HTMLElement, elementId: string) => {
  const escapedId = cssEscape(elementId);
  return [
    container.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${escapedId}"]`,
    ),
    container.querySelector<HTMLElement>(
      `.react-flow__edge[data-id="${escapedId}"]`,
    ),
  ].filter((element): element is HTMLElement => element !== null);
};

const clearHighlights = (container: HTMLElement, elementIds: Set<string>) => {
  for (const elementId of elementIds) {
    for (const target of getElementTargets(container, elementId)) {
      target.classList.remove("umlstudio-collaboration-highlighted");
      target.style.removeProperty("--umlstudio-collaboration-highlight-color");
    }
  }
};

const CURSOR_HOTSPOT = { x: 2, y: 1 };

function CollaboratorCursors({
  active,
  awareness,
}: {
  active: boolean;
  awareness: CollaborationAwarenessApi;
}) {
  const viewport = useViewport();
  const [collaborators, setCollaborators] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    if (!active) {
      setCollaborators([]);
      return;
    }

    const unsubscribe = awareness.subscribeToAwarenessChanges((states) => {
      const localClientId = awareness.getLocalAwarenessClientId();
      const next = Array.from(states.entries()).flatMap(([clientId, state]) => {
        if (clientId === localClientId) return [];

        const cursor = state?.cursor;
        const user = state?.user;
        if (!cursor || !user) return [];

        return [
          {
            clientId,
            name: user.name,
            color: user.color,
            x: cursor.x,
            y: cursor.y,
          },
        ];
      });

      setCollaborators(next);
    });

    return unsubscribe;
  }, [active, awareness]);

  if (!active) return null;

  return (
    <div className="umlstudio-collaboration-cursors">
      {collaborators.map((collaborator) => {
        const canvasPosition = flowToCanvasPosition(
          {
            x: collaborator.x,
            y: collaborator.y,
          },
          viewport,
        );

        return (
          <div
            key={collaborator.clientId}
            className="umlstudio-collaboration-cursor"
            style={{
              left: canvasPosition.x - CURSOR_HOTSPOT.x,
              top: canvasPosition.y - CURSOR_HOTSPOT.y,
            }}
          >
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              style={{ display: "block" }}
            >
              <path
                d="M2 1L2 18L6.5 13.8L9.5 19L12 17.7L9 12.6L15 12.2L2 1Z"
                fill={collaborator.color}
                stroke="var(--umlstudio-on-collaboration-cursor, #ffffff)"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className="umlstudio-collaboration-cursor-label"
              style={{ backgroundColor: collaborator.color }}
            >
              {collaborator.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LocalCollaborationAwareness({
  active,
  options,
  awareness,
}: {
  active: boolean;
  options: CollaborationLayerOptions;
  awareness: CollaborationAwarenessApi;
}) {
  const reactFlow = useReactFlow();
  const selectedElementIds = useDiagramStore(
    (state) => state.selectedElementIds,
  );
  const diagramId = useDiagramStore((state) => state.diagramId);

  useEffect(() => {
    if (!active || !options.showCursors) {
      awareness.setLocalAwarenessCursor(null);
      return;
    }

    const container = document.getElementById(
      `react-flow-library-${diagramId}`,
    );
    if (!container) return;

    const rafRef = { current: 0 };
    const pendingRef = {
      current: null as CollaborationCursor | null,
    };

    const flushCursor = () => {
      if (pendingRef.current) {
        awareness.setLocalAwarenessCursor(pendingRef.current);
        pendingRef.current = null;
      }
      rafRef.current = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      pendingRef.current = {
        x: flowPosition.x,
        y: flowPosition.y,
      };

      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushCursor);
      }
    };

    const handlePointerLeave = () => {
      awareness.setLocalAwarenessCursor(null);
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      awareness.setLocalAwarenessCursor(null);
    };
  }, [active, awareness, diagramId, options.showCursors, reactFlow]);

  useEffect(() => {
    if (!active || !options.showSelectionHighlights) {
      awareness.setLocalAwarenessSelectedElement(null);
      return;
    }

    const currentSelected = selectedElementIds.at(-1) ?? null;
    awareness.setLocalAwarenessSelectedElement(currentSelected);

    if (!currentSelected) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        awareness.setLocalAwarenessSelectedElement(null);
      }, 60_000);
    };

    resetInactivityTimer();

    const handleActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener("pointermove", handleActivity);
    window.addEventListener("keydown", handleActivity);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      awareness.setLocalAwarenessSelectedElement(null);
    };
  }, [active, awareness, options.showSelectionHighlights, selectedElementIds]);

  return null;
}

function CollaboratorSelectionHighlights({
  active,
  awareness,
}: {
  active: boolean;
  awareness: CollaborationAwarenessApi;
}) {
  const [remoteHighlights, setRemoteHighlights] = useState<Map<string, string>>(
    () => new Map(),
  );
  const highlightedIdsRef = useRef<Set<string>>(new Set());
  const { diagramId, nodes, edges, previewMode } = useDiagramStore(
    useShallow((state) => ({
      diagramId: state.diagramId,
      nodes: state.nodes,
      edges: state.edges,
      previewMode: state.previewMode,
    })),
  );

  useEffect(() => {
    if (!active) {
      setRemoteHighlights(new Map());
      return;
    }

    const unsubscribe = awareness.subscribeToAwarenessChanges((states) => {
      const localClientId = awareness.getLocalAwarenessClientId();
      const next = new Map<string, string>();

      for (const [clientId, state] of states.entries()) {
        if (clientId === localClientId) continue;

        const selectedElementId = state?.selectedElementId;
        const userColor = state?.user?.color;
        if (selectedElementId && userColor) {
          next.set(selectedElementId, userColor);
        }
      }

      setRemoteHighlights(next);
    });

    return unsubscribe;
  }, [active, awareness]);

  const highlightSignature = useMemo(
    () =>
      Array.from(remoteHighlights.entries())
        .map(([elementId, color]) => `${elementId}:${color}`)
        .sort()
        .join("|"),
    [remoteHighlights],
  );

  useEffect(() => {
    const container = document.getElementById(
      `react-flow-library-${diagramId}`,
    );
    if (!container) return;

    clearHighlights(container, highlightedIdsRef.current);
    highlightedIdsRef.current = new Set();

    if (!active || previewMode) return;

    const actuallyHighlighted = new Set<string>();
    for (const [elementId, color] of remoteHighlights.entries()) {
      const targets = getElementTargets(container, elementId);
      if (targets.length === 0) continue;

      for (const target of targets) {
        target.style.setProperty(
          "--umlstudio-collaboration-highlight-color",
          color,
        );
        target.classList.add("umlstudio-collaboration-highlighted");
      }
      actuallyHighlighted.add(elementId);
    }

    highlightedIdsRef.current = actuallyHighlighted;

    return () => {
      clearHighlights(container, highlightedIdsRef.current);
      highlightedIdsRef.current = new Set();
    };
  }, [
    active,
    diagramId,
    edges,
    highlightSignature,
    nodes,
    previewMode,
    remoteHighlights,
  ]);

  return null;
}

const sameViewport = (
  a: CollaborationViewport | null,
  b: CollaborationViewport | null,
) => a != null && b != null && a.x === b.x && a.y === b.y && a.zoom === b.zoom;

function ViewportFollow({
  awareness,
  followedClientId,
  onStopFollowing,
}: {
  awareness: CollaborationAwarenessApi;
  followedClientId: number | null;
  onStopFollowing: () => void;
}) {
  const reactFlow = useReactFlow();

  const pendingViewport = useRef<CollaborationViewport | null>(null);
  const broadcastRaf = useRef(0);
  const applyingRemote = useRef(false);
  const lastApplied = useRef<CollaborationViewport | null>(null);

  const flushViewport = useCallback(() => {
    broadcastRaf.current = 0;
    if (pendingViewport.current) {
      awareness.setLocalAwarenessViewport(pendingViewport.current);
      pendingViewport.current = null;
    }
  }, [awareness]);

  const handleViewportChange = useCallback(
    (viewport: CollaborationViewport) => {
      if (applyingRemote.current || sameViewport(viewport, lastApplied.current))
        return;
      if (followedClientId !== null) onStopFollowing();
      pendingViewport.current = viewport;
      if (!broadcastRaf.current) {
        broadcastRaf.current = window.requestAnimationFrame(flushViewport);
      }
    },
    [followedClientId, onStopFollowing, flushViewport],
  );

  useOnViewportChange({ onChange: handleViewportChange });

  useEffect(() => {
    awareness.setLocalAwarenessViewport(reactFlow.getViewport());
  }, [awareness, reactFlow]);

  useEffect(
    () => () => {
      if (broadcastRaf.current) {
        window.cancelAnimationFrame(broadcastRaf.current);
      }
    },
    [],
  );

  useEffect(() => {
    awareness.setLocalAwarenessFollowing(followedClientId);
    return () => awareness.setLocalAwarenessFollowing(null);
  }, [awareness, followedClientId]);

  useEffect(() => {
    if (followedClientId == null) return;
    if (followedClientId === awareness.getLocalAwarenessClientId()) return;

    const applyTargetViewport = (states: Map<number, CollaborationState>) => {
      const target = states.get(followedClientId);
      if (!target) {
        onStopFollowing();
        return;
      }
      const viewport = target.viewport;
      if (!viewport || sameViewport(viewport, lastApplied.current)) return;

      lastApplied.current = viewport;
      applyingRemote.current = true;
      try {
        reactFlow.setViewport(viewport, { duration: 0 });
      } finally {
        applyingRemote.current = false;
      }
    };

    applyTargetViewport(awareness.getAwarenessStates());
    const unsubscribe =
      awareness.subscribeToAwarenessChanges(applyTargetViewport);

    return () => {
      unsubscribe();
      lastApplied.current = null;
    };
  }, [awareness, followedClientId, onStopFollowing, reactFlow]);

  return null;
}

function FollowIndicator({
  target,
  onStopFollowing,
}: {
  target: FollowTarget;
  onStopFollowing: () => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="umlstudio-collaboration-follow-frame"
        style={{ boxShadow: `inset 0 0 0 3px ${target.color}` }}
      />
      <div
        className="umlstudio-collaboration-follow-banner"
        style={{ borderColor: target.color }}
      >
        <span
          aria-hidden="true"
          className="umlstudio-collaboration-follow-banner-dot"
          style={{ backgroundColor: target.color }}
        />
        <span
          className="umlstudio-collaboration-follow-banner-text"
          role="status"
        >
          Following {target.name}
        </span>
        <button
          type="button"
          className="umlstudio-collaboration-follow-banner-stop"
          aria-label={`Stop following ${target.name}`}
          onClick={onStopFollowing}
        >
          Stop
        </button>
      </div>
    </>
  );
}

export function CollaborationLayer({
  options,
  awareness,
}: CollaborationLayerProps) {
  const previewMode = useDiagramStore((state) => state.previewMode);
  const active = options.enabled && options.user !== undefined;
  const remoteVisualsActive = active && !previewMode;
  const followActive = remoteVisualsActive && options.showFollow;

  const [followTarget, setFollowTarget] = useState<FollowTarget | null>(null);

  const stopFollowing = useCallback(() => {
    setFollowTarget(null);
    awareness.setLocalAwarenessFollowing(null);
  }, [awareness]);

  useEffect(() => {
    if (!followActive) {
      return;
    }

    const syncFromAwareness = (states: Map<number, CollaborationState>) => {
      const localId = awareness.getLocalAwarenessClientId();
      const localState = states.get(localId);
      const followingId = localState?.followingClientId ?? null;
      if (followingId === null) {
        setFollowTarget((prev) => (prev ? null : prev));
      } else {
        const targetState = states.get(followingId);
        const targetUser = targetState?.user;
        if (targetUser) {
          setFollowTarget((prev) =>
            prev?.clientId === followingId &&
            prev?.name === targetUser.name &&
            prev?.color === targetUser.color
              ? prev
              : {
                  clientId: followingId,
                  name: targetUser.name,
                  color: targetUser.color,
                },
          );
        }
      }
    };

    const unsubscribe = awareness.subscribeToAwarenessChanges(syncFromAwareness);
    return () => {
      unsubscribe();
      setFollowTarget((prev) => (prev ? null : prev));
    };
  }, [followActive, awareness]);

  return (
    <>
      <LocalCollaborationAwareness
        active={active && !previewMode}
        options={options}
        awareness={awareness}
      />
      <CollaboratorCursors
        active={remoteVisualsActive && options.showCursors}
        awareness={awareness}
      />
      <CollaboratorSelectionHighlights
        active={remoteVisualsActive && options.showSelectionHighlights}
        awareness={awareness}
      />
      {followActive && (
        <ViewportFollow
          awareness={awareness}
          followedClientId={followTarget?.clientId ?? null}
          onStopFollowing={stopFollowing}
        />
      )}
      {followActive && followTarget && (
        <FollowIndicator
          target={followTarget}
          onStopFollowing={stopFollowing}
        />
      )}
    </>
  );
}
