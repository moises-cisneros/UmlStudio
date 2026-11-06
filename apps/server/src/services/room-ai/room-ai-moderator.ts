import { randomUUID } from "node:crypto"
import type { RoomAiEvent, RoomAiPolicy, RoomChatMessage, UMLModel } from "@umlstudio/core"
import type { AuthorshipRepository } from "./authorship-repository.js"
import type { BoardReplica } from "./board-replica.js"
import type { ChatRepository } from "./chat-repository.js"
import { logger } from "../../logger.js"

export interface AuditViolation {
  principle: string
  severity: string
  element_id?: string
  element_name?: string
  message: string
  suggestion?: string
}

export interface AuditResult {
  violations: AuditViolation[]
  suggestions?: unknown[]
  summary?: string
}

export interface RoomAiModeratorDeps {
  getPolicy: (diagramId: string) => Promise<RoomAiPolicy>
  getBoardReplica: (diagramId: string) => BoardReplica | undefined
  authorship: AuthorshipRepository
  resolveUserProfile?: (userId: string) => Promise<{ name?: string } | undefined>
  chat: ChatRepository<RoomChatMessage>
  publish?: (diagramId: string, event: RoomAiEvent) => void | Promise<void>
  audit?: (board: UMLModel) => Promise<AuditResult>
  inactivityDelayMs?: number
  rateLimitMs?: number
  now?: () => number
}

export interface RoomAiModerator {
  onBoardChanged: (diagramId: string) => void
  triggerAudit: (diagramId: string) => Promise<RoomChatMessage | undefined>
  close: (diagramId: string) => void
  closeAll: () => void
}

export const DEFAULT_INACTIVITY_DELAY_MS = 20_000
export const DEFAULT_RATE_LIMIT_MS = 120_000

/**
 * Runs the local heuristic audit for SOLID smells (SRP / God Class).
 * Matches the logic in ai-service `/api/audit`.
 */
export function runLocalSolidAudit(board: UMLModel): AuditResult {
  const violations: AuditViolation[] = []
  const nodes = board.nodes ?? []

  for (const node of nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>
    const methods = Array.isArray(data.methods) ? data.methods : []
    const attrs = Array.isArray(data.attributes) ? data.attributes : []
    const name = typeof data.name === "string" ? data.name : "Element"

    if (methods.length > 7 || methods.length + attrs.length > 12) {
      violations.push({
        principle: "Single Responsibility Principle (SRP)",
        severity: "warning",
        element_id: node.id,
        element_name: name,
        message: `La clase '${name}' posee ${methods.length} métodos y ${attrs.length} atributos, sugiriendo un God Class / Acumulador de responsabilidades.`,
        suggestion:
          "Considera extraer responsabilidades auxiliares en clases colaboradoras o aplicar el patrón Facade/Strategy.",
      })
    }
  }

  return {
    violations,
    summary: `Auditoría completada sobre ${nodes.length} nodo(s). ${violations.length} advertencia(s) detectada(s).`,
  }
}

/**
 * Creates the default audit runner, calling the HTTP `/api/audit` endpoint
 * on ai-service if configured and falling back to the local SOLID heuristic.
 */
export function createAuditService(options: {
  serviceUrl?: string
  fetcher?: typeof fetch
}): (board: UMLModel) => Promise<AuditResult> {
  const fetcher = options.fetcher ?? fetch
  const serviceUrl = options.serviceUrl?.trim()

  return async (board: UMLModel): Promise<AuditResult> => {
    if (serviceUrl) {
      try {
        const endpoint = new URL("/api/audit", serviceUrl)
        const res = await fetcher(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: board }),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const body = (await res.json()) as AuditResult
          if (Array.isArray(body.violations)) {
            return body
          }
        }
      } catch (err) {
        logger.warn({ err }, "remote /api/audit failed; falling back to local heuristic audit")
      }
    }
    return runLocalSolidAudit(board)
  }
}

/**
 * Creates the proactive moderator (CU-15 FA-07 / RF-62 / Backlog E6-01).
 * When enabled (proactive=true), after 20 s without board changes, runs the
 * heuristic audit on the replica and publishes at most one remark every 2 minutes,
 * addressed to the element's author.
 */
export function createRoomAiModerator(deps: RoomAiModeratorDeps): RoomAiModerator {
  const inactivityDelayMs = deps.inactivityDelayMs ?? DEFAULT_INACTIVITY_DELAY_MS
  const rateLimitMs = deps.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS
  const nowFn = deps.now ?? Date.now
  const auditFn = deps.audit ?? runLocalSolidAudit

  const inactivityTimers = new Map<string, NodeJS.Timeout>()
  const lastRemarkTimestamps = new Map<string, number>()

  async function triggerAudit(diagramId: string): Promise<RoomChatMessage | undefined> {
    try {
      const policy = await deps.getPolicy(diagramId)
      if (!policy.enabled || !policy.proactive) {
        return undefined
      }

      const currentTime = nowFn()
      const lastRemarkTime = lastRemarkTimestamps.get(diagramId) ?? 0
      if (currentTime - lastRemarkTime < rateLimitMs) {
        return undefined
      }

      const replica = deps.getBoardReplica(diagramId)
      if (!replica || !replica.isComplete()) {
        return undefined
      }

      const board = replica.getModel()
      const auditResult = await auditFn(board)
      if (!auditResult.violations || auditResult.violations.length === 0) {
        return undefined
      }

      const authors = await deps.authorship.getAll(diagramId)

      // Find first violation with a known author, or fall back to the first violation
      const chosenViolation =
        auditResult.violations.find((v) => v.element_id && authors[v.element_id]) ??
        auditResult.violations[0]

      const authorId = chosenViolation.element_id ? authors[chosenViolation.element_id] : undefined
      let authorName: string | undefined

      if (authorId) {
        try {
          const profile = await deps.resolveUserProfile?.(authorId)
          authorName = profile?.name ?? authorId
        } catch {
          authorName = authorId
        }
      }

      const prefix = authorName ? `@${authorName}: ` : "Moderador: "
      const suggestionPart = chosenViolation.suggestion ? ` ${chosenViolation.suggestion}` : ""
      const text = `${prefix}${chosenViolation.message}${suggestionPart}`

      const message: RoomChatMessage = {
        id: randomUUID(),
        diagramId,
        author: { id: "room-ai", name: "Room AI", kind: "ai" },
        text,
        createdAt: new Date(currentTime).toISOString(),
      }

      await deps.chat.append(diagramId, message)
      await deps.publish?.(diagramId, { type: "message.created", message })
      lastRemarkTimestamps.set(diagramId, currentTime)

      return message
    } catch (err) {
      logger.error({ err, diagramId }, "room AI proactive moderator audit failed")
      return undefined
    }
  }

  return {
    onBoardChanged(diagramId: string): void {
      const existing = inactivityTimers.get(diagramId)
      if (existing) {
        clearTimeout(existing)
      }

      const timer = setTimeout(() => {
        inactivityTimers.delete(diagramId)
        void triggerAudit(diagramId)
      }, inactivityDelayMs)

      inactivityTimers.set(diagramId, timer)
    },

    triggerAudit,

    close(diagramId: string): void {
      const timer = inactivityTimers.get(diagramId)
      if (timer) {
        clearTimeout(timer)
        inactivityTimers.delete(diagramId)
      }
    },

    closeAll(): void {
      for (const timer of inactivityTimers.values()) {
        clearTimeout(timer)
      }
      inactivityTimers.clear()
      lastRemarkTimestamps.clear()
    },
  }
}
