import { useState } from "react"
import { Button } from "@umlstudio/ui/components/button"
import { DialogFooter } from "@umlstudio/ui/components/dialog"
import { useTranslation } from "@/i18n"

type PreferenceRow = { id: number; value: string }

type RoomAiPreferencesEditorProps = {
  preferences: string[]
  onSave: (preferences: string[]) => Promise<void>
  onCancel: () => void
  footerClassName?: string
}

export function RoomAiPreferencesEditor({
  preferences,
  onSave,
  onCancel,
  footerClassName,
}: RoomAiPreferencesEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<PreferenceRow[]>(() =>
    preferences.map((value, id) => ({ id, value }))
  )
  const [nextId, setNextId] = useState(preferences.length)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await onSave(draft.map(({ value }) => value.trim()).filter(Boolean))
      onCancel()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {draft.map(({ id, value }) => (
          <div
            key={id}
            className="flex items-center gap-1 rounded-md border border-border-subtle/60 bg-surface-raised p-0.5"
          >
            <input
              value={value}
              onChange={(event) =>
                setDraft((current) =>
                  current.map((row) =>
                    row.id === id ? { ...row, value: event.target.value } : row
                  )
                )
              }
              aria-label={t.roomAi.preferenceInput}
              className="h-7 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setDraft((current) => current.filter((row) => row.id !== id))}
            >
              {t.roomAi.deletePreference}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-xs"
          onClick={() => {
            const id = nextId
            setNextId((current) => current + 1)
            setDraft((current) => [...current, { id, value: "" }])
          }}
          disabled={draft.length >= 20}
        >
          {t.roomAi.addPreference}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t.roomAi.preferencesSaveError}
        </p>
      )}
      <DialogFooter className={footerClassName}>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? t.common.savingChanges : t.common.save}
        </Button>
      </DialogFooter>
    </>
  )
}
