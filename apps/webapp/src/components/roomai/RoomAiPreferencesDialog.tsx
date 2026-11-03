import { RoomAiPreferencesEditor } from "./RoomAiPreferencesEditor"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@umlstudio/ui/components/dialog"
import { useTranslation } from "@/i18n"

type RoomAiPreferencesDialogProps = {
  open: boolean
  preferences: string[]
  onOpenChange: (open: boolean) => void
  onSave: (preferences: string[]) => Promise<void>
}

export function RoomAiPreferencesDialog({
  open,
  preferences,
  onOpenChange,
  onSave,
}: RoomAiPreferencesDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent aria-describedby="room-ai-preferences-description">
          <DialogHeader>
            <DialogTitle>{t.roomAi.preferencesTitle}</DialogTitle>
            <DialogDescription id="room-ai-preferences-description" className="text-xs">
              {t.roomAi.preferencesDescription}
            </DialogDescription>
          </DialogHeader>
          <RoomAiPreferencesEditor
            key={JSON.stringify(preferences)}
            preferences={preferences}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
