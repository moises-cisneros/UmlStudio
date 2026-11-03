import { useState } from "react"
import type { RoomAiPolicy } from "@umlstudio/core"
import { Button } from "@umlstudio/ui/components/button"
import { Checkbox } from "@umlstudio/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@umlstudio/ui/components/dialog"
import { Field, FieldContent, FieldTitle } from "@umlstudio/ui/components/field"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@umlstudio/ui/components/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@umlstudio/ui/components/tabs"
import { useTranslation } from "@/i18n"
import { RoomAiPreferencesEditor } from "./RoomAiPreferencesEditor"

type RoomAiSettingsDialogProps = {
  open: boolean
  policy: RoomAiPolicy
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (policy: RoomAiPolicy) => Promise<unknown>
  preferences?: string[]
  onSavePreferences?: (preferences: string[]) => Promise<void>
}

export function RoomAiSettingsDialog(props: RoomAiSettingsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <RoomAiSettingsForm
          key={`${props.policy.enabled}-${props.policy.allowChanges}-${props.policy.applyMode}-${props.policy.proactive}`}
          {...props}
        />
      )}
    </Dialog>
  )
}

function RoomAiSettingsForm({
  policy,
  isSaving,
  onOpenChange,
  onSave,
  preferences,
  onSavePreferences,
}: RoomAiSettingsDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(policy)
  const [saveFailed, setSaveFailed] = useState(false)
  const hasPreferences = Boolean(onSavePreferences && preferences)
  const savePolicy = async () => {
    setSaveFailed(false)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch {
      setSaveFailed(true)
    }
  }
  const policyPanel = (
    <>
      <PolicyFields draft={draft} setDraft={setDraft} isSaving={isSaving} />
      <PolicyFooter
        saveFailed={saveFailed}
        isSaving={isSaving}
        onCancel={() => onOpenChange(false)}
        onSave={() => void savePolicy()}
      />
    </>
  )

  return (
    <DialogContent aria-describedby="room-ai-settings-description">
      <DialogHeader>
        <DialogTitle>{t.roomAi.settingsTitle}</DialogTitle>
        <DialogDescription id="room-ai-settings-description" className="text-xs">
          {t.roomAi.settingsDescription}
        </DialogDescription>
      </DialogHeader>
      {hasPreferences ? (
        <Tabs defaultValue="policy">
          <TabsList className="grid w-full grid-cols-2 rounded-lg p-0.5">
            <TabsTrigger value="policy" className="text-xs">
              {t.roomAi.policyTab}
            </TabsTrigger>
            <TabsTrigger value="preferences" className="text-xs">
              {t.roomAi.preferencesTab}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="policy" className="mt-3">
            {policyPanel}
          </TabsContent>
          <TabsContent value="preferences" className="mt-3">
            <PreferencesPanel
              key={JSON.stringify(preferences ?? [])}
              preferences={preferences ?? []}
              onSave={onSavePreferences!}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      ) : (
        policyPanel
      )}
    </DialogContent>
  )
}

function PolicyFields({
  draft,
  setDraft,
  isSaving,
}: {
  draft: RoomAiPolicy
  setDraft: React.Dispatch<React.SetStateAction<RoomAiPolicy>>
  isSaving: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <label>
        <Field orientation="horizontal">
          <Checkbox
            checked={draft.enabled}
            onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))}
            aria-label={t.roomAi.enabledLabel}
            data-testid="room-ai-enabled"
            disabled={isSaving}
          />
          <FieldContent>
            <FieldTitle>{t.roomAi.enabledLabel}</FieldTitle>
          </FieldContent>
        </Field>
      </label>
      <label>
        <Field orientation="horizontal">
          <Checkbox
            checked={draft.allowChanges}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, allowChanges: checked }))
            }
            aria-label={t.roomAi.allowChangesLabel}
            data-testid="room-ai-allow-changes"
            disabled={isSaving}
          />
          <FieldContent>
            <FieldTitle>{t.roomAi.allowChangesLabel}</FieldTitle>
          </FieldContent>
        </Field>
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="room-ai-apply-mode" className="text-sm font-medium">
          {t.roomAi.applyModeLabel}
        </label>
        <Select
          value={draft.applyMode}
          onValueChange={(applyMode) =>
            setDraft((current) => ({
              ...current,
              applyMode: applyMode as RoomAiPolicy["applyMode"],
            }))
          }
          disabled={isSaving}
        >
          <SelectTrigger
            id="room-ai-apply-mode"
            aria-label={t.roomAi.applyModeLabel}
            className="w-full"
          >
            {draft.applyMode === "confirm" ? t.roomAi.applyModeConfirm : t.roomAi.applyModeAuto}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirm">{t.roomAi.applyModeConfirm}</SelectItem>
            <SelectItem value="auto">{t.roomAi.applyModeAuto}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label>
        <Field orientation="horizontal">
          <Checkbox
            checked={draft.proactive}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, proactive: checked }))
            }
            aria-label={t.roomAi.proactiveLabel}
            data-testid="room-ai-proactive"
            disabled={isSaving}
          />
          <FieldContent>
            <FieldTitle>{t.roomAi.proactiveLabel}</FieldTitle>
          </FieldContent>
        </Field>
      </label>
    </div>
  )
}

function PolicyFooter({
  saveFailed,
  isSaving,
  onCancel,
  onSave,
}: {
  saveFailed: boolean
  isSaving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {saveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t.roomAi.settingsSaveError}
        </p>
      )}
      <DialogFooter className="mt-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          {t.common.cancel}
        </Button>
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? t.common.savingChanges : t.common.save}
        </Button>
      </DialogFooter>
    </>
  )
}

function PreferencesPanel({
  preferences,
  onSave,
  onClose,
}: {
  preferences: string[]
  onSave: (preferences: string[]) => Promise<void>
  onClose: () => void
}) {
  return (
    <RoomAiPreferencesEditor
      preferences={preferences}
      onSave={onSave}
      onCancel={onClose}
      footerClassName="mt-3"
    />
  )
}
