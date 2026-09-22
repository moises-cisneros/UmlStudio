import { COLLAB_CURSOR_PALETTE } from "@/constants"
import type { CollaborationViewport, DraggingNode } from "@/typings"

const ADJECTIVES = ["Swift", "Bold", "Clever", "Bright", "Calm", "Eager", "Kind", "Noble"]

const ANIMALS = ["Falcon", "Otter", "Panda", "Lynx", "Dolphin", "Owl", "Fox", "Crane"]

export const randomCollabName = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `${adj} ${animal}`
}

export const collabColorFromName = (name: string): string => {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }

  const index = Math.abs(hash) % COLLAB_CURSOR_PALETTE.length
  return COLLAB_CURSOR_PALETTE[index]
}

export const sanitizeCollaborationViewport = (raw: unknown): CollaborationViewport | null => {
  if (raw == null || typeof raw !== "object") return null
  const { x, y, zoom } = raw as Record<string, unknown>
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(zoom) ||
    (zoom as number) <= 0
  ) {
    return null
  }
  return { x: x as number, y: y as number, zoom: zoom as number }
}

export const sanitizeDraggingNodes = (raw: unknown): DraggingNode[] | null => {
  if (!Array.isArray(raw)) return null
  const sanitized: DraggingNode[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue
    const { id, position, width, height } = entry as Record<string, unknown>
    if (typeof id !== "string" || position == null || typeof position !== "object") continue
    const { x, y } = position as Record<string, unknown>
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const node: DraggingNode = {
      id,
      position: { x: x as number, y: y as number },
    }
    if (width === null || Number.isFinite(width)) node.width = width as number | null
    if (height === null || Number.isFinite(height)) node.height = height as number | null
    sanitized.push(node)
  }
  return sanitized
}
