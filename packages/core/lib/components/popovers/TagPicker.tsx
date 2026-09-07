import React, { KeyboardEvent, useState } from "react"
import { Check, Plus, Tag, X } from "lucide-react"
import { Popover } from "@base-ui/react/popover"
import { IconButton, Tooltip } from "@/components/ui"
import { usePortalThemeVars } from "@/components/ui/portalTheme"
import { useUmlStudioPortalContainer } from "@/components/ui/portalContainer"
import { useLabels } from "@/i18n/useLabels"
import { useTagConfig } from "@/hooks/useTagConfig"
import { normalizeTags } from "@/utils"

interface TagControlProps {
  tags: string[]
  onChange: (tags: string[]) => void
  subject: string
}

export const TagChips: React.FC<Pick<TagControlProps, "tags" | "onChange">> = ({
  tags,
  onChange,
}) => {
  const t = useLabels()
  const { enabled } = useTagConfig()
  if (!enabled || tags.length === 0) return null

  return (
    <div data-slot="tag-field" className="umlstudio-tag-field">
      {tags.map((tag) => (
        <span key={tag} data-slot="tag-chip" className="umlstudio-tag-chip">
          <span>{tag}</span>
          <IconButton
            ariaLabel={t.removeTag(tag)}
            tooltip={t.removeTag(tag)}
            onClick={() =>
              onChange(tags.filter((existing) => existing !== tag))
            }
          >
            <X width={12} height={12} aria-hidden="true" />
          </IconButton>
        </span>
      ))}
    </div>
  )
}

export const TagPicker: React.FC<TagControlProps> = ({
  tags,
  onChange,
  subject,
}) => {
  const t = useLabels()
  const { enabled, available, allowCreate } = useTagConfig()
  const [draft, setDraft] = useState("")
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)
  const portalThemeVars = usePortalThemeVars(trigger)
  const portalContainer = useUmlStudioPortalContainer()

  if (!enabled) return null

  const commit = (next: string[]) => onChange(normalizeTags(next))
  const toggle = (tag: string) =>
    tags.includes(tag)
      ? commit(tags.filter((existing) => existing !== tag))
      : commit([...tags, tag])

  const options = [...new Set([...available, ...tags])]

  const addFromDraft = () => {
    const value = draft.trim()
    if (value !== "") commit([...tags, value])
    setDraft("")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    addFromDraft()
  }

  return (
    <Popover.Root onOpenChange={(open) => !open && setDraft("")}>
      <Tooltip title={t.editTagsFor(subject)}>
        <Popover.Trigger
          ref={setTrigger}
          data-slot="icon-button"
          aria-label={t.editTagsFor(subject)}
        >
          <Tag width={16} height={16} aria-hidden="true" />
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal container={portalContainer}>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup
            data-slot="tag-picker-content"
            className="umlstudio-tag-picker__popup"
            aria-label={t.editTagsFor(subject)}
            style={portalThemeVars}
          >
            {options.length > 0 && (
              <div
                data-slot="tag-picker-list"
                className="umlstudio-tag-picker__list"
                role="group"
                aria-label={t.editTagsFor(subject)}
              >
                {options.map((tag) => {
                  const selected = tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      data-slot="tag-picker-option"
                      className="umlstudio-tag-picker__option"
                      onClick={() => toggle(tag)}
                    >
                      <Check
                        className="umlstudio-tag-picker__check"
                        data-selected={selected || undefined}
                        width={14}
                        height={14}
                        aria-hidden="true"
                      />
                      <span>{tag}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {options.length === 0 && !allowCreate && (
              <div
                data-slot="tag-picker-empty"
                className="umlstudio-tag-picker__empty"
              >
                {t.noTags}
              </div>
            )}

            {allowCreate && (
              <div className="umlstudio-tag-picker__add">
                <input
                  data-slot="tag-picker-add"
                  className="umlstudio-tag-picker__input"
                  aria-label={t.newTag}
                  placeholder={t.addTag}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <IconButton
                  ariaLabel={t.addTag}
                  tooltip={t.addTag}
                  onClick={addFromDraft}
                >
                  <Plus width={16} height={16} aria-hidden="true" />
                </IconButton>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
