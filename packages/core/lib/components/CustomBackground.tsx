import { Background, BackgroundVariant } from "@xyflow/react";
import { CANVAS } from "@/constants";

export const CustomBackground = () => {
  const DOTS_GAP = CANVAS.SNAP_TO_GRID_PX * 2;

  return (
    <Background
      id="umlstudio-dots-grid"
      gap={DOTS_GAP}
      size={1.5}
      color="var(--umlstudio-grid-dots, rgba(148, 163, 184, 0.28))"
      variant={BackgroundVariant.Dots}
    />
  );
};
