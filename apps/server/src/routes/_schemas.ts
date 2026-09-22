import { z } from "zod"

export const DiagramId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "diagramId must be URL-safe")

export const VersionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "versionId must be URL-safe")

export const DiagramBody = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  title: z.string(),
  type: z.string().min(1),
  nodes: z.array(z.unknown()).default([]),
  edges: z.array(z.unknown()).default([]),
  assessments: z.record(z.string(), z.unknown()).default({}),
  interactive: z.unknown().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const PutDiagramBody = DiagramBody.omit({ id: true })

export const PatchDiagramBody = z.object({
  title: z
    .string()
    .trim()
    .min(1, "title must not be empty")
    .max(200, "title must be at most 200 characters"),
})

export const PaginationQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  before: z.string().optional(),
})

export const DiagramIdParams = z.object({ diagramId: DiagramId })

export const DiagramIdAndVersionIdParams = z.object({
  diagramId: DiagramId,
  versionId: VersionId,
})
