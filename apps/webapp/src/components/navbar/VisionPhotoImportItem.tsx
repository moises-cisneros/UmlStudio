import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu"

interface VisionPhotoImportItemProps {
  close: () => void
  onImportPhoto: () => void
  disabled?: boolean
}

export function VisionPhotoImportItem({
  close,
  onImportPhoto,
  disabled,
}: VisionPhotoImportItemProps) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onImportPhoto()
          close()
        }
      }}
    >
      Importar desde imagen
    </DropdownMenuItem>
  )
}
