import { useEffect, useRef, useState } from "react";
import { useEditorContext } from "@/contexts";

export function useDiagramTitle() {
  const { editor } = useEditorContext();
  const [title, setTitle] = useState(
    editor?.getDiagramMetadata().diagramTitle || "",
  );
  const subId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!editor) return;
    subId.current = editor.subscribeToDiagramNameChange((t) => setTitle(t));
    setTitle(editor.getDiagramMetadata().diagramTitle || "");
    return () => {
      if (subId.current !== undefined) editor.unsubscribe(subId.current);
    };
  }, [editor]);

  const onValueChange = (next: string) => {
    editor?.updateDiagramTitle(next);
    setTitle(next);
  };

  return { value: title, onValueChange };
}
