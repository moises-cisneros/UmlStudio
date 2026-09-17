import { useReactFlow, useStore } from "@xyflow/react";
import { useShallow } from "zustand/shallow";
import {
  Maximize,
  Redo2,
  SquareMousePointer,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useDiagramStore,
  useMetadataStore,
  useOverlayStore,
} from "@/store/context";
import { useDiagramModifiable } from "@/hooks/useDiagramModifiable";
import { insetAwareFitView } from "@/overlay/fitView";
import { ariaKeyshortcuts } from "@/keyboard";
import { Tooltip } from "@/components/ui";
import { useLabels } from "@/i18n/useLabels";
import { useRovingToolbar } from "../useRovingToolbar";

export interface ZoomControlsProps {
  history?: boolean;
  vertical?: boolean;
  showFitView?: boolean;
  showSelection?: boolean;
}

export function ZoomControls({
  history = false,
  vertical = false,
  showFitView = false,
  showSelection = false,
}: ZoomControlsProps) {
  const rf = useReactFlow();
  const t = useLabels();
  const zoomLevelPercent = useStore((s) => Math.round(s.transform[2] * 100));
  const insets = useOverlayStore((s) => s.insets);
  const safeArea = useOverlayStore((s) => s.safeArea);

  const { canUndo, canRedo, undo, redo, undoManagerExist } = useDiagramStore(
    useShallow((state) => ({
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      undo: state.undo,
      redo: state.redo,
      undoManagerExist: state.undoManager !== null,
    })),
  );

  const isDiagramModifiable = useDiagramModifiable();
  const { multiSelectionMode, setMultiSelectionMode } = useMetadataStore(
    useShallow((state) => ({
      multiSelectionMode: state.multiSelectionMode,
      setMultiSelectionMode: state.setMultiSelectionMode,
    })),
  );

  const { ref: toolbarRef, onKeyDown: onToolbarKeyDown } =
    useRovingToolbar<HTMLDivElement>();

  return (
    <div
      ref={toolbarRef}
      onKeyDown={onToolbarKeyDown}
      className={`umlstudio-chrome-toolbar${vertical ? " umlstudio-chrome-toolbar--vertical" : ""}`}
      role="toolbar"
      aria-label={t.zoomToolbar}
      aria-orientation={vertical ? "vertical" : "horizontal"}
    >
      <div
        className={`umlstudio-glass umlstudio-chrome-cluster${vertical ? " umlstudio-chrome-cluster--vertical" : ""}`}
      >
        <Tooltip title={t.zoomIn}>
          <button
            type="button"
            className="umlstudio-chrome-iconbtn"
            onClick={() => rf.zoomIn()}
            aria-keyshortcuts={ariaKeyshortcuts("zoom-in")}
            aria-label={t.zoomIn}
          >
            <ZoomIn width={16} height={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip title={t.resetZoom}>
          <button
            type="button"
            className="umlstudio-chrome-iconbtn umlstudio-chrome-iconbtn--readout"
            onClick={() => rf.zoomTo(1)}
            aria-keyshortcuts={ariaKeyshortcuts("reset-zoom")}
            aria-label={t.zoomReadout(zoomLevelPercent)}
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "2px 4px",
              minWidth: vertical ? "32px" : "40px",
            }}
          >
            {zoomLevelPercent}%
          </button>
        </Tooltip>

        <Tooltip title={t.zoomOut}>
          <button
            type="button"
            className="umlstudio-chrome-iconbtn"
            onClick={() => rf.zoomOut()}
            aria-keyshortcuts={ariaKeyshortcuts("zoom-out")}
            aria-label={t.zoomOut}
          >
            <ZoomOut
              width={16}
              height={16}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </Tooltip>

        {showFitView && (
          <Tooltip title={t.fitView}>
            <button
              type="button"
              className="umlstudio-chrome-iconbtn"
              onClick={() => insetAwareFitView(rf, insets, safeArea)}
              aria-keyshortcuts={ariaKeyshortcuts("fit-view")}
              aria-label={t.fitView}
            >
              <Maximize
                width={16}
                height={16}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </Tooltip>
        )}

        {showSelection && isDiagramModifiable && (
          <Tooltip title={t.multiSelectionHint}>
            <button
              type="button"
              className="umlstudio-chrome-iconbtn umlstudio-chrome-iconbtn--toggle"
              onClick={() => setMultiSelectionMode(!multiSelectionMode)}
              aria-label={t.multiSelection}
              aria-pressed={multiSelectionMode}
            >
              <SquareMousePointer
                width={16}
                height={16}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </Tooltip>
        )}
      </div>

      {history && undoManagerExist && (
        <div
          className={`umlstudio-glass umlstudio-chrome-cluster${vertical ? " umlstudio-chrome-cluster--vertical" : ""}`}
        >
          <Tooltip title={t.undoHint}>
            <span>
              <button
                type="button"
                className="umlstudio-chrome-iconbtn"
                onClick={undo}
                aria-keyshortcuts={ariaKeyshortcuts("undo")}
                disabled={!canUndo}
                aria-label={t.undo}
              >
                <Undo2
                  width={16}
                  height={16}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </span>
          </Tooltip>
          <Tooltip title={t.redoHint}>
            <span>
              <button
                type="button"
                className="umlstudio-chrome-iconbtn"
                onClick={redo}
                aria-keyshortcuts={ariaKeyshortcuts("redo")}
                disabled={!canRedo}
                aria-label={t.redo}
              >
                <Redo2
                  width={16}
                  height={16}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </span>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
