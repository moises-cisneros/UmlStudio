import type { ThumbnailViewportPriority } from "@/hooks/useThumbnailViewportPriority";

export const dequeueNextDiagram = <T extends { id: string }>(
  queue: T[],
  viewportPriority?: Pick<ThumbnailViewportPriority, "pickNext">,
): T | undefined => {
  if (queue.length === 0) return undefined;

  const prioritizedId = viewportPriority?.pickNext(
    queue.map((diagram) => diagram.id),
  );
  if (prioritizedId) {
    const index = queue.findIndex((diagram) => diagram.id === prioritizedId);
    if (index >= 0) {
      return queue.splice(index, 1)[0];
    }
  }

  return queue.shift();
};
