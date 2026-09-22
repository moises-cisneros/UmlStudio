import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "@umlstudio/ui/components/button"
import { RotateCcw } from "lucide-react"
import {
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@umlstudio/ui/components/alert-dialog"
import { useModalContext } from "@/contexts"
import type { PendingVersion } from "@/types"
import { log } from "@/logger"
import { useVersioningTranslation } from "./strings"

interface ConfirmRestoreModalProps {
  version: PendingVersion | null
  onConfirm: () => Promise<void> | void
}

export const ConfirmRestoreModal = ({ version, onConfirm }: ConfirmRestoreModalProps) => {
  const t = useVersioningTranslation()
  const { closeModal } = useModalContext()
  const [working, setWorking] = useState(false)

  const handleConfirm = async () => {
    setWorking(true)
    try {
      await onConfirm()
      closeModal()
    } catch (err) {
      log.error("Confirm restore failed", err as Error)
      toast.error(t.restoreFailed)
    } finally {
      setWorking(false)
    }
  }

  const label = version?.description?.trim() || version?.name?.trim() || "this version"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
          <RotateCcw className="size-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <AlertDialogDescription className="text-sm leading-relaxed text-foreground">
            {t.confirmRestoreBody(`'${label}'`)}
          </AlertDialogDescription>
        </div>
      </div>
      <AlertDialogFooter className="mt-2">
        <AlertDialogCancel disabled={working}>{t.cancel}</AlertDialogCancel>
        <Button variant="default" onClick={handleConfirm} disabled={working}>
          {t.confirmRestoreButton}
        </Button>
      </AlertDialogFooter>
    </div>
  )
}
