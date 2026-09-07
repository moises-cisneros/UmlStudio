import { Background, BackgroundVariant } from "@xyflow/react"
import { CANVAS } from "@/constants"

export const CustomBackground = () => {
  const FINE_GRID_GAP = CANVAS.SNAP_TO_GRID_PX
  const MAJOR_GRID_GAP = CANVAS.SNAP_TO_GRID_PX * 10

  const HALF_PIXEL_NUDGE = 0.5
  const crispOffset = (gap: number) => gap / 2 + HALF_PIXEL_NUDGE

  return (
    <>
      <Background
        id="1"
        gap={FINE_GRID_GAP}
        offset={crispOffset(FINE_GRID_GAP)}
        color="var(--umlstudio-gray, #e9ecef)"
        variant={BackgroundVariant.Lines}
      />

      <Background
        id="2"
        gap={MAJOR_GRID_GAP}
        offset={crispOffset(MAJOR_GRID_GAP)}
        color="var(--umlstudio-grid, rgba(36, 39, 36, 0.1))"
        variant={BackgroundVariant.Lines}
      />
    </>
  )
}
