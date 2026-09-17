import { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@umlstudio/ui/components/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@umlstudio/ui/components/alert-dialog";
import { useModalContext } from "@/contexts";
import { selectScopedPreview, useVersionStore } from "@/stores/useVersionStore";
import type { PendingVersion } from "@/types";
import type { RepositoryKind } from "@/services/versionRepository";
import { useDeleteVersionMutation } from "@/queries/versionMutations";
import { useClosePreview } from "@/hooks/useVersionPreviewUrlSync";
import { log } from "@/logger";
import { useVersioningTranslation } from "./strings";

interface DeleteVersionModalProps {
  diagramId: string;
  versionId: string;
  version: PendingVersion | null;
  kind: RepositoryKind;
}

export const DeleteVersionModal = ({
  diagramId,
  versionId,
  version,
  kind,
}: DeleteVersionModalProps) => {
  const t = useVersioningTranslation();
  const { closeModal } = useModalContext();
  const deleteVersion = useDeleteVersionMutation(kind, diagramId);
  const closePreview = useClosePreview();
  const previewingThis = useVersionStore(
    (s) => selectScopedPreview(s, diagramId)?.versionId === versionId,
  );
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setWorking(true);
    try {
      if (previewingThis) closePreview();
      await deleteVersion.mutateAsync({ versionId });
      closeModal();
    } catch (err) {
      log.error("Delete version failed", err);
      toast.error(t.deleteFailed);
    } finally {
      setWorking(false);
    }
  };

  const label = version
    ? version.description?.trim() || version.name?.trim() || t.unnamed
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive dark:bg-destructive/20">
          <Trash2 className="size-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <AlertDialogDescription className="text-sm leading-relaxed text-foreground">
            {label
              ? `'${label}' will be permanently removed. This action cannot be undone.`
              : t.deleteFallbackBody}
          </AlertDialogDescription>
        </div>
      </div>
      <AlertDialogFooter className="mt-2">
        <AlertDialogCancel disabled={working}>{t.cancel}</AlertDialogCancel>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={working}
        >
          {t.delete}
        </Button>
      </AlertDialogFooter>
    </div>
  );
};
