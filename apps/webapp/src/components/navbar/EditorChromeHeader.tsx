import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useEditorContext } from "@/contexts";
import { useRegionHost } from "@/hooks/useRegionHost";
import { NARROW_VIEW_QUERY } from "@/constants";
import { WorkbenchHeader } from "./WorkbenchHeader";

export function EditorChromeHeader() {
  const { editor } = useEditorContext();
  const isNarrow = useMediaQuery(NARROW_VIEW_QUERY);
  const isNative = Capacitor.isNativePlatform();
  const headerHost = useRegionHost(editor, "header", true);

  if (!headerHost) return null;
  return createPortal(
    <WorkbenchHeader
      layout={isNarrow ? "narrow" : "full"}
      hideBrand={isNarrow || isNative}
    />,
    headerHost,
  );
}
