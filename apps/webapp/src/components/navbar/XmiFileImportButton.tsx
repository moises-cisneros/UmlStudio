import { DropdownMenuItem } from "@umlstudio/ui/components/dropdown-menu";
import React, { useRef } from "react";
import { useImportDiagramFile } from "@/hooks/useImportDiagramFile";

interface DiagramFileImportItemProps {
  label: string;
  accept: string;
  onClose: () => void;
}

export function DiagramFileImportItem({
  label,
  accept,
  onClose,
}: DiagramFileImportItemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFile = useImportDiagramFile();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    onClose();
    void importFile(file);

    event.target.value = "";
  };

  return (
    <>
      <DropdownMenuItem
        closeOnClick={false}
        onClick={() => fileInputRef.current?.click()}
      >
        {label}
      </DropdownMenuItem>
      <input
        type="file"
        accept={accept}
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}

export const JsonFileImportButton: React.FC<{ close: () => void }> = ({
  close,
}) => (
  <DiagramFileImportItem
    label="Importar JSON"
    accept=".json,application/json"
    onClose={close}
  />
);

export const XmiFileImportButton: React.FC<{ close: () => void }> = ({
  close,
}) => (
  <DiagramFileImportItem
    label="Importar XMI (Architect)"
    accept=".xmi,.xml,application/xml,text/xml"
    onClose={close}
  />
);
