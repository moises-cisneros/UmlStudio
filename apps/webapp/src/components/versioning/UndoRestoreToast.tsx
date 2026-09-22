import { useEffect, useRef, useState, type FC } from "react"
import { toast } from "react-toastify"
import { log } from "@/logger"
import { useEditorContext } from "@/contexts"
import { useVersionStore } from "@/stores/useVersionStore"
import { useUndoRestoreMutation } from "@/queries/versionMutations"
import { useVersionRepositoryKind } from "@/contexts/VersionRepositoryContext"
import type { RepositoryKind } from "@/services/versionRepository"
import { versioningStrings as t } from "./strings"

const UNDO_RESTORE_TOAST_ID = "undo-restore"

const UndoRestoreToastBody: FC<{
  restoredVersionName: string
  kind: RepositoryKind
}> = ({ restoredVersionName, kind }) => {
  const undo = useVersionStore((s) => s.undoRestore)
  const dismiss = useVersionStore((s) => s.dismissUndoRestore)
  const undoRestore = useUndoRestoreMutation(kind)
  const { editor } = useEditorContext()
  const [submitting, setSubmitting] = useState(false)

  const onUndo = async () => {
    if (!editor || submitting || !undo) return
    if (Date.now() > undo.expiresAt) {
      dismiss()
      return
    }
    const currentBody = editor.model
    const store = useVersionStore.getState()
    if (store.preview !== null) store.exitPreview()
    setSubmitting(true)
    try {
      await undoRestore.mutateAsync({
        diagramId: undo.diagramId,
        autoSnapshotVersionId: undo.autoSnapshotVersionId,
        currentBody,
      })
      toast.dismiss(UNDO_RESTORE_TOAST_ID)
    } catch (err) {
      log.error("Undo restore failed", err)
      toast.error("Could not undo the restore.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-3">
      <span className="flex-1">
        {t.restoredSnack(restoredVersionName || "the previous version")}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={submitting}
        className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-accent-strong transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t.undoRestore}
      </button>
    </div>
  )
}

export const UndoRestoreToast: FC = () => {
  const undo = useVersionStore((s) => s.undoRestore)
  const dismiss = useVersionStore((s) => s.dismissUndoRestore)
  const kind = useVersionRepositoryKind()
  const shownIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!undo) {
      if (shownIdRef.current) {
        toast.dismiss(UNDO_RESTORE_TOAST_ID)
        shownIdRef.current = null
      }
      return
    }

    const remaining = Math.max(0, undo.expiresAt - Date.now())
    if (remaining <= 0) {
      dismiss()
      return
    }

    const body = <UndoRestoreToastBody restoredVersionName={undo.restoredVersionName} kind={kind} />

    if (shownIdRef.current === undo.autoSnapshotVersionId) {
      toast.update(UNDO_RESTORE_TOAST_ID, {
        render: body,
        autoClose: remaining,
      })
    } else {
      toast.info(body, {
        toastId: UNDO_RESTORE_TOAST_ID,
        autoClose: remaining,
        closeOnClick: false,
        onClose: () => {
          shownIdRef.current = null
          dismiss()
        },
      })
      shownIdRef.current = undo.autoSnapshotVersionId
    }
  }, [undo, dismiss, kind])

  return null
}
