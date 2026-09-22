import type { UmlStudioNode } from "@/typings"

export const MAX_TAG_LENGTH = 200
export const MAX_TAGS_PER_ELEMENT = 50

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

type TaggableData = { tags?: unknown; [key: string]: unknown }

export function normalizeTags(raw: unknown, maxCount = MAX_TAGS_PER_ELEMENT): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of raw) {
    if (typeof entry !== "string") continue
    const tag = entry.trim()
    if (tag === "" || tag.length > MAX_TAG_LENGTH || CONTROL_CHARS.test(tag)) {
      continue
    }
    if (seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= maxCount) break
  }
  return result
}

export function* taggableElements(
  nodes: readonly Pick<UmlStudioNode, "id" | "data">[]
): Generator<{ id: string; data: TaggableData }> {
  for (const node of nodes) {
    const data = (node.data ?? {}) as TaggableData
    yield { id: node.id, data }
    for (const [key, value] of Object.entries(data)) {
      if (key === "tags" || !Array.isArray(value)) continue
      for (const item of value) {
        if (item && typeof item === "object" && typeof item.id === "string") {
          yield { id: item.id, data: item as TaggableData }
        }
      }
    }
  }
}

export function applyTags(data: TaggableData, tags: unknown): void {
  const normalized = normalizeTags(tags)
  if (normalized.length > 0) data.tags = normalized
  else delete data.tags
}

export function withTags<T extends object>(data: T, tags: string[]): T {
  const next = { ...data }
  applyTags(next as TaggableData, tags)
  return next
}

export type TagOptions = {
  available?: string[]
  allowCreate?: boolean
}

export type TagConfig = {
  enabled: boolean
  available: string[]
  allowCreate: boolean
}

export const DISABLED_TAG_CONFIG: TagConfig = {
  enabled: false,
  available: [],
  allowCreate: false,
}

export function resolveTagConfig(input?: boolean | TagOptions): TagConfig {
  if (!input) return DISABLED_TAG_CONFIG
  if (input === true) return { enabled: true, available: [], allowCreate: true }
  const available = normalizeTags(input.available ?? [], Infinity)
  return {
    enabled: true,
    available,
    allowCreate: input.allowCreate ?? available.length === 0,
  }
}

export function applyElementTags<T extends { id: string; data: object }>(
  nodes: readonly T[],
  id: string,
  tags: string[]
): T[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true
      return { ...node, data: withTags(node.data, tags) }
    }
    let memberChanged = false
    const data: Record<string, unknown> = { ...node.data }
    for (const [key, value] of Object.entries(data)) {
      if (key === "tags" || !Array.isArray(value)) continue
      const members = value as { id?: string }[]
      if (!members.some((item) => item?.id === id)) continue
      data[key] = members.map((item) => (item?.id === id ? withTags(item, tags) : item))
      memberChanged = true
    }
    if (!memberChanged) return node
    changed = true
    return { ...node, data } as T
  })
  return changed ? next : (nodes as T[])
}

export function getElementIdsByTag(
  nodes: readonly Pick<UmlStudioNode, "id" | "data">[],
  tag: string
): string[] {
  if (typeof tag !== "string") return []
  const query = tag.trim()
  if (query === "") return []
  const ids: string[] = []
  for (const { id, data } of taggableElements(nodes)) {
    if (normalizeTags(data.tags).includes(query)) ids.push(id)
  }
  return ids
}
