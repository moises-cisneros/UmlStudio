import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileUpIcon } from "lucide-react";
import { toast } from "react-toastify";
import { useImportDiagramFile } from "@/hooks/useImportDiagramFile";

const dragHasFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false;

const isSupportedDiagram = (file: File) => {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xmi") || name.endsWith(".xml") || file.type.includes("xml")
  );
};

export function DiagramFileDropzone() {
  const importFile = useImportDiagramFile();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);

  const endDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
  }, []);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) endDrag();
    };

    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      endDrag();

      const files = Array.from(event.dataTransfer?.files ?? []);
      const diagram = files.find(isSupportedDiagram);
      if (!diagram) {
        toast.error("Drop an Enterprise Architect .xmi file.");
        return;
      }
      void importFile(diagram);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", endDrag);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", endDrag);
    };
  }, [endDrag, importFile]);

  if (!isDraggingFile) return null;

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background/92 p-6"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-background/60 px-10 py-8 text-center shadow-lg">
        <FileUpIcon className="size-9 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">
            Drop to import an XMI diagram
          </p>
          <p className="text-sm text-muted-foreground">
            An Enterprise Architect <code className="font-mono">.xmi</code> file
            opens as a new diagram.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
