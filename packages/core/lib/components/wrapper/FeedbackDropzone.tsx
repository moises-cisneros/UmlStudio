import { useDropFeedback } from "@/hooks/useDropFeedback"
import { useMetadataStore } from "@/store"
import { UmlStudioMode } from "@/typings"
import React, { useState } from "react"
import { useShallow } from "zustand/shallow"

interface Props {
  children: React.ReactNode
  elementId: string
  elementType?: string
  asElement?: "g" | "div" | "path"
}

export const FeedbackDropzone: React.FC<Props> = ({
  children,
  elementId,
  elementType,
  asElement = "g",
}) => {
  const { mode, readonly } = useMetadataStore(
    useShallow((store) => ({
      mode: store.mode,
      readonly: store.readonly,
    }))
  )
  const [isDragOver, setIsDragOver] = useState(false)
  const onDropHandle = useDropFeedback({ elementId, elementType })

  const canDropFeedback = mode === UmlStudioMode.Assessment && !readonly

  if (!canDropFeedback) return <>{children}</>

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()

    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()

    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"

    if (!isDragOver) {
      setIsDragOver(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    e.stopPropagation()
    setIsDragOver(false)
    onDropHandle(e as React.DragEvent<HTMLDivElement | SVGGElement>)
  }

  const getHoverStyle = () => {
    if (isDragOver) {
      if (asElement === "path") {
        return {
          stroke: "var(--umlstudio-dropzone-accent, #0064ff)",
        }
      }

      return {
        outline:
          "3px solid var(--umlstudio-dropzone-accent-fill, rgba(0, 100, 255, 0.4))",
      }
    }
  }

  const hoverStyle = getHoverStyle()

  if (asElement === "div") {
    return (
      <div
        id={elementId}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        style={hoverStyle}
      >
        {children}
      </div>
    )
  }

  return (
    <g
      id={elementId}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      style={hoverStyle}
    >
      {children}
    </g>
  )
}
