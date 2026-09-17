import React, { useEffect, useState } from "react";
import { RotateCcw, RotateCw, Scan, BoxSelect } from "lucide-react";
import { Button } from "@umlstudio/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { useEditorContext } from "@/contexts";
import { navbarButtonStyle } from "./styleConstants";
import { cn } from "@umlstudio/ui/lib/utils";

export const CanvasHeaderActions: React.FC = () => {
  const { editor } = useEditorContext();
  const [history, setHistory] = useState(() => ({
    canUndo: editor?.canUndo?.() ?? false,
    canRedo: editor?.canRedo?.() ?? false,
  }));
  const [isMultiSelect, setIsMultiSelect] = useState(
    () => editor?.isMultiSelection?.() ?? false,
  );

  useEffect(() => {
    if (!editor) return;

    const unsubHistory = editor.subscribeToUndoRedo?.((state) => {
      setHistory(state);
    });

    const unsubSelection = editor.subscribeToMultiSelection?.((enabled) => {
      setIsMultiSelect(enabled);
    });

    return () => {
      unsubHistory?.();
      unsubSelection?.();
    };
  }, [editor]);

  const handleUndo = () => {
    editor?.undo?.();
  };

  const handleRedo = () => {
    editor?.redo?.();
  };

  const handleFitView = () => {
    editor?.fitView?.();
  };

  const handleToggleMultiSelect = () => {
    editor?.toggleMultiSelection?.();
  };

  return (
    <div
      className="flex items-center gap-0.5"
      role="toolbar"
      aria-label="Canvas history and view tools"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={navbarButtonStyle(
                "h-8 w-8 p-0 inline-flex items-center justify-center",
              )}
              disabled={!history.canUndo}
              onClick={handleUndo}
              aria-label="Undo last action"
            >
              <RotateCcw
                className="size-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            </Button>
          }
        />
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={navbarButtonStyle(
                "h-8 w-8 p-0 inline-flex items-center justify-center",
              )}
              disabled={!history.canRedo}
              onClick={handleRedo}
              aria-label="Redo action"
            >
              <RotateCw className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={navbarButtonStyle(
                "h-8 w-8 p-0 inline-flex items-center justify-center",
              )}
              onClick={handleFitView}
              aria-label="Fit view"
            >
              <Scan className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>Fit to View</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                navbarButtonStyle(
                  "h-8 w-8 p-0 inline-flex items-center justify-center",
                ),
                isMultiSelect &&
                  "bg-primary/15 text-primary font-medium dark:bg-primary/25",
              )}
              onClick={handleToggleMultiSelect}
              aria-label="Toggle multiple selection"
              aria-pressed={isMultiSelect}
            >
              <BoxSelect
                className="size-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            </Button>
          }
        />
        <TooltipContent>Select Multiple</TooltipContent>
      </Tooltip>
    </div>
  );
};
