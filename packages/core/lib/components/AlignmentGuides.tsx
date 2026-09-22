import { useStore } from "@xyflow/react"
import { useAlignmentGuidesStore } from "@/store/context"
import { useShallow } from "zustand/shallow"
import "@/styles/alignmentGuides.css"

const GUIDE_LINE_SLOTS = 12

export const AlignmentGuides = () => {
  const { guides } = useAlignmentGuidesStore(
    useShallow((state) => ({
      guides: state.guides,
    }))
  )

  const viewport = useStore(
    useShallow((state) => ({
      x: state.transform[0],
      y: state.transform[1],
      zoom: state.transform[2],
    }))
  )

  const active = guides ?? []

  return (
    <svg
      className="alignment-guides-svg"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
      {Array.from({ length: GUIDE_LINE_SLOTS }, (_, index) => {
        const guide = active[index]
        if (!guide) {
          return <line key={index} style={{ display: "none" }} />
        }
        const vertical = guide.type === "vertical"
        const screen = vertical
          ? guide.position * viewport.zoom + viewport.x
          : guide.position * viewport.zoom + viewport.y
        return (
          <line
            key={index}
            x1={vertical ? screen : "0"}
            y1={vertical ? "0" : screen}
            x2={vertical ? screen : "100%"}
            y2={vertical ? "100%" : screen}
            className={`alignment-guide-line ${
              vertical ? "alignment-guide-vertical" : "alignment-guide-horizontal"
            }`}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
