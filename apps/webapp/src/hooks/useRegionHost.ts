import { useEffect, useState } from "react";
import { useEditorContext } from "@/contexts";

type Editor = ReturnType<typeof useEditorContext>["editor"];
type Region = Parameters<NonNullable<Editor>["getRegionElement"]>[0];

export function useRegionHost(
  editor: Editor,
  region: Region,
  active: boolean,
): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!editor || !active) {
      setHost(null);
      return;
    }
    setHost(editor.getRegionElement(region));
    return () => editor.releaseRegionElement(region);
  }, [editor, region, active]);
  return host;
}
