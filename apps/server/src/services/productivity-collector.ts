export interface CollaboratorTimeMetric {
  userId: string;
  userName: string;
  userColor?: string;
  activeSeconds: number;
  idleSeconds: number;
  lastActiveTimestamp: number;
}

export interface NodeContentionMetric {
  nodeId: string;
  nodeName: string;
  contentionCount: number;
  totalLockDurationMs: number;
  averageLockDurationMs: number;
  currentHolderUserId?: string;
}

export type FluencyStatus = "green" | "yellow" | "red";

export interface DiagramProductivityReport {
  diagramId: string;
  sessionStartedAt: number;
  lastUpdatedAt: number;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  collaborators: CollaboratorTimeMetric[];
  bottlenecks: NodeContentionMetric[];
  velocity: {
    classesPerHour: number;
    methodsPerHour: number;
    refactorsPerHour: number;
    totalClassesCreated: number;
    totalMethodsCreated: number;
    totalRefactors: number;
  };
  fluencyStatus: FluencyStatus;
  fluencyScore: number;
}

interface ActiveNodeLock {
  userId: string;
  userName: string;
  nodeName: string;
  startTime: number;
}

interface CollaboratorSessionState {
  userId: string;
  userName: string;
  userColor?: string;
  lastActiveTimestamp: number;
  activeSeconds: number;
  idleSeconds: number;
  currentLockedNodeId: string | null;
  currentLockStartTime: number | null;
}

interface DiagramSessionMetrics {
  diagramId: string;
  sessionStartedAt: number;
  totalClassesCreated: number;
  totalMethodsCreated: number;
  totalRefactors: number;
  collaborators: Map<string, CollaboratorSessionState>;
  nodeLocks: Map<string, ActiveNodeLock>;
  nodeContention: Map<
    string,
    {
      nodeName: string;
      contentionCount: number;
      totalLockDurationMs: number;
      lockCount: number;
    }
  >;
}

const IDLE_THRESHOLD_MS = 60_000;

export class ProductivityCollector {
  private diagrams = new Map<string, DiagramSessionMetrics>();

  private getOrCreateDiagramSession(diagramId: string): DiagramSessionMetrics {
    let session = this.diagrams.get(diagramId);
    if (!session) {
      session = {
        diagramId,
        sessionStartedAt: Date.now(),
        totalClassesCreated: 0,
        totalMethodsCreated: 0,
        totalRefactors: 0,
        collaborators: new Map(),
        nodeLocks: new Map(),
        nodeContention: new Map(),
      };
      this.diagrams.set(diagramId, session);
    }
    return session;
  }

  public recordActivity(
    diagramId: string,
    user: {
      userId: string;
      userName?: string | undefined;
      color?: string | undefined;
    },
    options: {
      isMutation?: boolean | undefined;
      createdClasses?: number | undefined;
      createdMethods?: number | undefined;
      refactors?: number | undefined;
      timestamp?: number | undefined;
    } = {},
  ): void {
    const session = this.getOrCreateDiagramSession(diagramId);
    const now = options.timestamp ?? Date.now();

    let collab = session.collaborators.get(user.userId);
    if (!collab) {
      collab = {
        userId: user.userId,
        userName: user.userName || user.userId.slice(0, 8),
        userColor: user.color,
        lastActiveTimestamp: now,
        activeSeconds: 0,
        idleSeconds: 0,
        currentLockedNodeId: null,
        currentLockStartTime: null,
      };
      session.collaborators.set(user.userId, collab);
    } else {
      if (user.userName) collab.userName = user.userName;
      if (user.color) collab.userColor = user.color;

      const elapsedMs = now - collab.lastActiveTimestamp;
      if (elapsedMs > 0) {
        if (elapsedMs <= IDLE_THRESHOLD_MS) {
          collab.activeSeconds += elapsedMs / 1000;
        } else {
          collab.activeSeconds += IDLE_THRESHOLD_MS / 1000;
          collab.idleSeconds += (elapsedMs - IDLE_THRESHOLD_MS) / 1000;
        }
      }
      collab.lastActiveTimestamp = now;
    }

    if (options.createdClasses) {
      session.totalClassesCreated += options.createdClasses;
    }
    if (options.createdMethods) {
      session.totalMethodsCreated += options.createdMethods;
    }
    if (options.refactors) {
      session.totalRefactors += options.refactors;
    }
  }

  public recordNodeLock(
    diagramId: string,
    user: { userId: string; userName?: string | undefined },
    nodeId: string | null,
    nodeName?: string | undefined,
    timestamp?: number | undefined,
  ): { contention: boolean; conflictingUser?: string | undefined } {
    const session = this.getOrCreateDiagramSession(diagramId);
    const now = timestamp ?? Date.now();
    let isContention = false;
    let conflictUser: string | undefined;

    let collab = session.collaborators.get(user.userId);
    if (!collab) {
      this.recordActivity(diagramId, user, { timestamp: now });
      collab = session.collaborators.get(user.userId)!;
    }

    // Release any previous lock held by this user
    if (collab.currentLockedNodeId && collab.currentLockStartTime) {
      const prevNodeId = collab.currentLockedNodeId;
      const duration = now - collab.currentLockStartTime;
      const existing = session.nodeContention.get(prevNodeId);
      if (existing) {
        existing.totalLockDurationMs += duration;
        existing.lockCount += 1;
      }
      session.nodeLocks.delete(prevNodeId);
      collab.currentLockedNodeId = null;
      collab.currentLockStartTime = null;
    }

    if (nodeId) {
      const activeLock = session.nodeLocks.get(nodeId);
      if (activeLock && activeLock.userId !== user.userId) {
        // Contention collision!
        isContention = true;
        conflictUser = activeLock.userName;

        const stat = session.nodeContention.get(nodeId) || {
          nodeName: nodeName || activeLock.nodeName || nodeId,
          contentionCount: 0,
          totalLockDurationMs: 0,
          lockCount: 0,
        };
        stat.contentionCount += 1;
        if (nodeName) stat.nodeName = nodeName;
        session.nodeContention.set(nodeId, stat);
      } else {
        // Acquire lock
        session.nodeLocks.set(nodeId, {
          userId: user.userId,
          userName: user.userName || user.userId,
          nodeName: nodeName || nodeId,
          startTime: now,
        });
        collab.currentLockedNodeId = nodeId;
        collab.currentLockStartTime = now;

        if (!session.nodeContention.has(nodeId)) {
          session.nodeContention.set(nodeId, {
            nodeName: nodeName || nodeId,
            contentionCount: 0,
            totalLockDurationMs: 0,
            lockCount: 0,
          });
        }
      }
    }

    return { contention: isContention, conflictingUser: conflictUser };
  }

  public recordDisconnection(
    diagramId: string,
    userId: string,
    timestamp?: number,
  ): void {
    const session = this.diagrams.get(diagramId);
    if (!session) return;
    const now = timestamp ?? Date.now();

    const collab = session.collaborators.get(userId);
    if (collab && collab.currentLockedNodeId && collab.currentLockStartTime) {
      const prevNodeId = collab.currentLockedNodeId;
      const duration = now - collab.currentLockStartTime;
      const existing = session.nodeContention.get(prevNodeId);
      if (existing) {
        existing.totalLockDurationMs += duration;
        existing.lockCount += 1;
      }
      session.nodeLocks.delete(prevNodeId);
      collab.currentLockedNodeId = null;
      collab.currentLockStartTime = null;
    }
  }

  public getReport(
    diagramId: string,
    now: number = Date.now(),
  ): DiagramProductivityReport {
    const session = this.getOrCreateDiagramSession(diagramId);

    const collaboratorsList: CollaboratorTimeMetric[] = [];
    let totalActiveSec = 0;
    let totalIdleSec = 0;

    for (const collab of session.collaborators.values()) {
      let active = collab.activeSeconds;
      let idle = collab.idleSeconds;

      const delta = now - collab.lastActiveTimestamp;
      if (delta > 0) {
        if (delta <= IDLE_THRESHOLD_MS) {
          active += delta / 1000;
        } else {
          active += IDLE_THRESHOLD_MS / 1000;
          idle += (delta - IDLE_THRESHOLD_MS) / 1000;
        }
      }

      totalActiveSec += active;
      totalIdleSec += idle;

      collaboratorsList.push({
        userId: collab.userId,
        userName: collab.userName,
        userColor: collab.userColor,
        activeSeconds: Math.round(active),
        idleSeconds: Math.round(idle),
        lastActiveTimestamp: collab.lastActiveTimestamp,
      });
    }

    const bottlenecks: NodeContentionMetric[] = [];
    let totalContentionCollisions = 0;
    let prolongedLocksCount = 0;

    for (const [nodeId, stat] of session.nodeContention.entries()) {
      const activeLock = session.nodeLocks.get(nodeId);
      let totalDuration = stat.totalLockDurationMs;
      let count = stat.lockCount;

      if (activeLock) {
        totalDuration += now - activeLock.startTime;
        count += 1;
      }

      const avgDuration = count > 0 ? Math.round(totalDuration / count) : 0;
      totalContentionCollisions += stat.contentionCount;

      if (avgDuration > 45_000) {
        prolongedLocksCount += 1;
      }

      bottlenecks.push({
        nodeId,
        nodeName: stat.nodeName,
        contentionCount: stat.contentionCount,
        totalLockDurationMs: totalDuration,
        averageLockDurationMs: avgDuration,
        currentHolderUserId: activeLock?.userId,
      });
    }

    // Sort bottlenecks by contention count desc, then lock duration desc
    bottlenecks.sort(
      (a, b) =>
        b.contentionCount - a.contentionCount ||
        b.totalLockDurationMs - a.totalLockDurationMs,
    );

    // Calculate velocity (per hour of active session time)
    const effectiveHours = Math.max(totalActiveSec / 3600, 1 / 60);
    const classesPerHour =
      Math.round((session.totalClassesCreated / effectiveHours) * 10) / 10;
    const methodsPerHour =
      Math.round((session.totalMethodsCreated / effectiveHours) * 10) / 10;
    const refactorsPerHour =
      Math.round((session.totalRefactors / effectiveHours) * 10) / 10;

    // Compute fluency score (0 - 100)
    let score = 100;
    score -= totalContentionCollisions * 15;
    score -= prolongedLocksCount * 20;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    let fluencyStatus: FluencyStatus = "green";
    if (score < 50 || totalContentionCollisions >= 3) {
      fluencyStatus = "red";
    } else if (score < 80 || totalContentionCollisions > 0) {
      fluencyStatus = "yellow";
    }

    return {
      diagramId,
      sessionStartedAt: session.sessionStartedAt,
      lastUpdatedAt: now,
      totalActiveSeconds: Math.round(totalActiveSec),
      totalIdleSeconds: Math.round(totalIdleSec),
      collaborators: collaboratorsList,
      bottlenecks,
      velocity: {
        classesPerHour,
        methodsPerHour,
        refactorsPerHour,
        totalClassesCreated: session.totalClassesCreated,
        totalMethodsCreated: session.totalMethodsCreated,
        totalRefactors: session.totalRefactors,
      },
      fluencyStatus,
      fluencyScore: score,
    };
  }

  public clear(diagramId?: string): void {
    if (diagramId) {
      this.diagrams.delete(diagramId);
    } else {
      this.diagrams.clear();
    }
  }
}

export const productivityCollector = new ProductivityCollector();
