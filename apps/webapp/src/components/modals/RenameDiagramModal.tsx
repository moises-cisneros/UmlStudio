import React, { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@umlstudio/ui/components/button";
import { Input } from "@umlstudio/ui/components/input";
import { Field, FieldLabel } from "@umlstudio/ui/components/field";
import { DialogFooter } from "@umlstudio/ui/components/dialog";
import { useModalContext, useEditorContext } from "@/contexts";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { DiagramApiClient } from "@/services/DiagramApiClient";
import { log } from "@/logger";
import { HomeDialogContent } from "./HomeDialog";

interface RenameDiagramModalProps {
  diagramId: string;
  initialTitle?: string;
  source?: "local" | "shared";
  onRenamed?: (newTitle: string) => void;
  onClose?: () => void;
}

export const RenameDiagramModal: React.FC<RenameDiagramModalProps> = ({
  diagramId,
  initialTitle = "",
  source = "local",
  onRenamed,
  onClose,
}) => {
  const { closeModal } = useModalContext();
  const { editor } = useEditorContext();
  const renameModel = usePersistenceModelStore((state) => state.renameModel);
  const [title, setTitle] = useState(initialTitle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = title.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= 200;

  const handleClose = () => {
    onClose?.();
    closeModal();
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (source === "shared") {
        await DiagramApiClient.patchDiagramTitle(diagramId, trimmed);
      } else {
        renameModel(diagramId, trimmed);
      }

      if (editor?.getDiagramMetadata()?.diagramTitle !== undefined) {
        editor.updateDiagramTitle(trimmed);
      }

      toast.success("Diagram renamed successfully");
      onRenamed?.(trimmed);
      handleClose();
    } catch (err) {
      log.error("Failed to rename diagram", err as Error);
      toast.error("Could not rename diagram. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="flex min-w-0 flex-col gap-4">
      <HomeDialogContent testId="rename-diagram-dialog">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="diagram-new-title" className="text-xs font-semibold text-foreground">
            Diagram Name
          </FieldLabel>
          <Input
            id="diagram-new-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Architecture Order Processing"
            maxLength={200}
            autoFocus
            disabled={isSubmitting}
            className="w-full"
          />
        </Field>
      </HomeDialogContent>

      <DialogFooter className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? "Renaming…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
};
