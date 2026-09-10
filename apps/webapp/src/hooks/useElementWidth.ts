import { useEffect, useState, type RefObject } from "react";

export function useElementWidth<T extends Element>(
  ref: RefObject<T | null>,
): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    setWidth(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next =
        entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setWidth((prev) =>
        prev !== undefined && Math.abs(prev - next) < 0.5 ? prev : next,
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
