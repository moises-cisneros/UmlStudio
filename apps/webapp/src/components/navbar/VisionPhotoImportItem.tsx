import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu";

interface VisionPhotoImportItemProps {
  close: () => void;
  onImportPhoto: () => void;
}

export function VisionPhotoImportItem({
  close,
  onImportPhoto,
}: VisionPhotoImportItemProps) {
  return (
    <DropdownMenuItem
      onClick={() => {
        onImportPhoto();
        close();
      }}
    >
      Importar desde imagen
    </DropdownMenuItem>
  );
}
