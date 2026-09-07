import React, { useId } from "react"
import { Input } from "@umlstudio/ui/components/input"
import { Textarea } from "@umlstudio/ui/components/textarea"

type TextFieldElement = HTMLInputElement & HTMLTextAreaElement

export interface TextFieldProps {
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: React.ChangeEvent<TextFieldElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<TextFieldElement>) => void
  onBlur?: (event: React.FocusEvent<TextFieldElement>) => void
  onFocus?: (event: React.FocusEvent<TextFieldElement>) => void
  placeholder?: string
  label?: React.ReactNode
  name?: string
  id?: string
  type?: React.HTMLInputTypeAttribute
  disabled?: boolean
  autoFocus?: boolean
  fullWidth?: boolean
  multiline?: boolean
  minRows?: number
  maxLength?: number
  error?: boolean
  helperText?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  "aria-label"?: string
  [dataAttr: `data-${string}`]: unknown
}

export const TextField: React.FC<TextFieldProps> = ({
  value,
  defaultValue,
  onChange,
  onKeyDown,
  onBlur,
  onFocus,
  placeholder,
  label,
  name,
  id,
  type,
  disabled,
  autoFocus,
  fullWidth,
  multiline,
  minRows,
  maxLength,
  error,
  helperText,
  className,
  style,
  ...rest
}) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const helperId = helperText ? `${inputId}-helper` : undefined

  const wrapperStyle: React.CSSProperties = {
    display: "inline-flex",
    flexDirection: "column",
    width: fullWidth ? "100%" : undefined,
    ...style,
  }

  const sharedProps = {
    id: inputId,
    name,
    value,
    defaultValue,
    placeholder,
    disabled,
    autoFocus,
    maxLength,
    onChange: onChange as React.ChangeEventHandler<TextFieldElement>,
    onKeyDown: onKeyDown as React.KeyboardEventHandler<TextFieldElement>,
    onBlur: onBlur as React.FocusEventHandler<TextFieldElement>,
    onFocus: onFocus as React.FocusEventHandler<TextFieldElement>,
    className,
    "aria-invalid": error || undefined,
    "aria-describedby": helperId,
    ...rest,
  }

  return (
    <span style={wrapperStyle}>
      {label && (
        <label htmlFor={inputId} data-slot="textfield-label">
          {label}
        </label>
      )}
      {multiline ? (
        <Textarea
          rows={minRows}
          {...sharedProps}
          style={{
            resize: "none",
            minHeight: `calc(${minRows ?? 1} * 1lh + 1rem)`,
            maxHeight: "12lh",
            overflowY: "auto",
          }}
        />
      ) : (
        <Input type={type ?? "text"} {...sharedProps} />
      )}
      {helperText && (
        <span
          id={helperId}
          data-slot="textfield-helper"
          data-error={error || undefined}
        >
          {helperText}
        </span>
      )}
    </span>
  )
}
