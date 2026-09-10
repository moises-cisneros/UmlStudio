import { useEffect } from "react";

const BASE_TITLE = "UmlStudio";

export function useDocumentTitle(name?: string | null) {
  useEffect(() => {
    const trimmed = name?.trim();
    document.title = trimmed ? `${trimmed} – ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [name]);
}
