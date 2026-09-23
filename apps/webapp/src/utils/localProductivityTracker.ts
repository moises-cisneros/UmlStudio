interface LocalSessionData {
  diagramId: string
  sessionStartedAt: number
  lastActiveTimestamp: number
  activeSeconds: number
  idleSeconds: number
  createdClasses: number
  createdMethods: number
  refactors: number
}

const IDLE_THRESHOLD_MS = 60_000
const sessions = new Map<string, LocalSessionData>()
let activeDiagramId: string | null = null
let isInitialized = false
let isTrackingPaused = false

export function setTrackingPaused(paused: boolean) {
  isTrackingPaused = paused
}

function getOrCreateSession(diagramId: string): LocalSessionData {
  let session = sessions.get(diagramId)
  if (!session) {
    const now = Date.now()
    session = {
      diagramId,
      sessionStartedAt: now,
      lastActiveTimestamp: now,
      activeSeconds: 0,
      idleSeconds: 0,
      createdClasses: 0,
      createdMethods: 0,
      refactors: 0,
    }
    sessions.set(diagramId, session)
  }
  return session
}

function handleUserActivity() {
  if (isTrackingPaused || !activeDiagramId) return
  const session = getOrCreateSession(activeDiagramId)
  const now = Date.now()
  const elapsedMs = now - session.lastActiveTimestamp

  if (elapsedMs > 0) {
    if (elapsedMs <= IDLE_THRESHOLD_MS) {
      session.activeSeconds += elapsedMs / 1000
    } else {
      session.activeSeconds += IDLE_THRESHOLD_MS / 1000
      session.idleSeconds += (elapsedMs - IDLE_THRESHOLD_MS) / 1000
    }
  }
  session.lastActiveTimestamp = now
}

export function setActiveDiagramForTracking(diagramId: string | null) {
  if (activeDiagramId && activeDiagramId !== diagramId) {
    handleUserActivity()
  }
  activeDiagramId = diagramId
  if (diagramId) {
    getOrCreateSession(diagramId)
  }

  if (!isInitialized && typeof window !== "undefined") {
    isInitialized = true
    const throttledHandler = throttle(handleUserActivity, 1000)
    window.addEventListener("pointerdown", throttledHandler, { passive: true })
    window.addEventListener("keydown", throttledHandler, { passive: true })
    window.addEventListener("wheel", throttledHandler, { passive: true })
  }
}

export function recordLocalMutation(
  diagramId: string,
  delta: { createdClasses?: number; createdMethods?: number; refactors?: number }
) {
  const session = getOrCreateSession(diagramId)
  handleUserActivity()
  if (delta.createdClasses) session.createdClasses += delta.createdClasses
  if (delta.createdMethods) session.createdMethods += delta.createdMethods
  if (delta.refactors) session.refactors += delta.refactors
}

export function getLocalSessionStats(diagramId: string): LocalSessionData {
  const session = getOrCreateSession(diagramId)
  const now = Date.now()
  const elapsedMs = isTrackingPaused ? 0 : now - session.lastActiveTimestamp

  let currentActive = session.activeSeconds
  let currentIdle = session.idleSeconds

  if (elapsedMs > 0) {
    if (elapsedMs <= IDLE_THRESHOLD_MS) {
      currentActive += elapsedMs / 1000
    } else {
      currentActive += IDLE_THRESHOLD_MS / 1000
      currentIdle += (elapsedMs - IDLE_THRESHOLD_MS) / 1000
    }
  }

  return {
    ...session,
    activeSeconds: Math.round(currentActive),
    idleSeconds: Math.round(currentIdle),
    lastActiveTimestamp: isTrackingPaused ? session.lastActiveTimestamp : now,
  }
}

function throttle(fn: () => void, waitMs: number): () => void {
  let lastCall = 0
  return () => {
    const now = Date.now()
    if (now - lastCall >= waitMs) {
      lastCall = now
      fn()
    }
  }
}
