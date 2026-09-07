import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { ChevronDown } from "lucide-react"
import { useUmlStudioPortalContainer } from "./portalContainer"
import { usePortalThemeVars } from "./portalTheme"
import { useLabels } from "@/i18n/useLabels"

export interface SelectOption {
  value: string
  label: string
  renderOption?: () => React.ReactNode
  renderValue?: () => React.ReactNode
}

export interface SelectProps {
  value?: string
  onChange: (value: string) => void
  options: ReadonlyArray<SelectOption>
  label?: React.ReactNode
  placeholder?: string
  fullWidth?: boolean
  disabled?: boolean
  id?: string
  "aria-label"?: string
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  label,
  placeholder,
  fullWidth = true,
  disabled,
  id,
  "aria-label": ariaLabel,
}) => {
  const t = useLabels()
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listboxId = `${triggerId}-listbox`

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  )
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const typeahead = useRef<{ query: string; at: number }>({ query: "", at: 0 })

  const portalThemeVars = usePortalThemeVars(trigger)
  const portalContainer = useUmlStudioPortalContainer()

  const selected = options.find((o) => o.value === value)

  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      const idx = Math.max(
        0,
        options.findIndex((o) => o.value === value)
      )
      setActiveIndex(idx)
      requestAnimationFrame(() => optionRefs.current[idx]?.focus())
    }
    wasOpen.current = open
  }, [open, options, value])

  const commit = useCallback(
    (next: string) => {
      onChange(next)
      setOpen(false)
    },
    [onChange]
  )

  const moveActive = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(options.length - 1, next))
      setActiveIndex(clamped)
      optionRefs.current[clamped]?.focus()
    },
    [options.length]
  )

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          moveActive(activeIndex + 1)
          break
        case "ArrowUp":
          e.preventDefault()
          moveActive(activeIndex - 1)
          break
        case "Home":
          e.preventDefault()
          moveActive(0)
          break
        case "End":
          e.preventDefault()
          moveActive(options.length - 1)
          break
        case "Enter":
        case " ":
          e.preventDefault()
          commit(options[activeIndex].value)
          break
        default: {
          if (e.key.length !== 1) return
          const now = Date.now()
          const query =
            now - typeahead.current.at < 600
              ? typeahead.current.query + e.key
              : e.key
          typeahead.current = { query, at: now }
          const lower = query.toLowerCase()
          const match = options.findIndex((o) =>
            o.label.toLowerCase().startsWith(lower)
          )
          if (match >= 0) moveActive(match)
        }
      }
    },
    [activeIndex, commit, moveActive, options]
  )

  return (
    <span
      className="umlstudio-select"
      style={{ width: fullWidth ? "100%" : undefined }}
    >
      {label && (
        <label htmlFor={triggerId} className="umlstudio-select-label">
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <button
              ref={setTrigger}
              type="button"
              id={triggerId}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listboxId : undefined}
              aria-label={ariaLabel}
              disabled={disabled}
              className="umlstudio-select-trigger"
            >
              <span className="umlstudio-select-value">
                {selected ? (
                  (selected.renderValue?.() ?? selected.label)
                ) : (
                  <span className="umlstudio-select-placeholder">
                    {placeholder ?? t.selectPlaceholder}
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className="umlstudio-select-icon"
              />
            </button>
          }
        />
        <Popover.Portal container={portalContainer}>
          <Popover.Positioner align="start" sideOffset={4} collisionPadding={8}>
            <Popover.Popup
              initialFocus={false}
              className="umlstudio-select-content"
              style={{
                ...portalThemeVars,
                width: "var(--anchor-width)",
                maxHeight: "min(320px, var(--available-height))",
              }}
            >
              <div
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                className="umlstudio-select-listbox"
                onKeyDown={onListKeyDown}
              >
                {options.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={index === activeIndex ? 0 : -1}
                      ref={(el) => {
                        optionRefs.current[index] = el
                      }}
                      className={`umlstudio-select-option${
                        isSelected ? " umlstudio-select-option--selected" : ""
                      }`}
                      onClick={() => commit(option.value)}
                    >
                      {option.renderOption?.() ?? option.label}
                    </button>
                  )
                })}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  )
}
