import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu"
import React, { useRef } from "react"
import { useImportDiagramFile } from "@/hooks/useImportDiagramFile"

interface DiagramFileImportItemProps {
  label: string
  accept: string
  onClose: () => void
  disabled?: boolean
}

export function DiagramFileImportItem({
  label,
  accept,
  onClose,
  disabled,
}: DiagramFileImportItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFile = useImportDiagramFile()

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const file = event.target.files?.[0]
    if (!file) return

    onClose()
    void importFile(file)

    event.target.value = ""
  }

  return (
    <>
      <DropdownMenuItem
        disabled={disabled}
        closeOnClick={false}
        onClick={() => {
          if (!disabled) fileInputRef.current?.click()
        }}
      >
        {label}
      </DropdownMenuItem>
      <input
        type="file"
        accept={accept}
        ref={fileInputRef}
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />
    </>
  )
}

export const JsonFileImportButton: React.FC<{ close: () => void; disabled?: boolean }> = ({
  close,
  disabled,
}) => (
  <DiagramFileImportItem
    label="Importar JSON"
    accept=".json,application/json"
    onClose={close}
    disabled={disabled}
  />
)

export const XmiFileImportButton: React.FC<{ close: () => void; disabled?: boolean }> = ({
  close,
  disabled,
}) => (
  <DiagramFileImportItem
    label="Importar XMI (Architect)"
    accept=".xmi,.xml,application/xml,text/xml"
    onClose={close}
    disabled={disabled}
  />
)
