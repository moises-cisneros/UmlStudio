import { Position } from "@xyflow/system"
import { IPoint, tryFindStraightPath } from "@/edges/Connection"
import {
  routeOrthogonalPath,
  routeCrossesHardObstacle,
  removeDuplicatePoints,
} from "@/utils/edgeUtils"
import {
  routeConflictsWithNeighborEdges,
  straightPathClearsBodies,
} from "@/utils/geometry/orthogonalRouter"
import type { ObstacleRect } from "@/utils/geometry/obstacles"

export type StepEdgeRouteParams = {
  enableStraightPath: boolean
  adjustedSource: IPoint
  adjustedTarget: IPoint
  sourcePosition: Position
  targetPosition: Position
  padding: number
  rounded: {
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
  }
  sourceAbsolutePosition: IPoint
  targetAbsolutePosition: IPoint
  sourceSize: { width: number; height: number }
  targetSize: { width: number; height: number }
  obstacles: readonly ObstacleRect[]
  neighborEdges: readonly IPoint[][]
}

export function routeStepEdge(p: StepEdgeRouteParams): IPoint[] {
  const routeSource = { x: p.adjustedSource.x, y: p.adjustedSource.y }
  const routeTarget = { x: p.adjustedTarget.x, y: p.adjustedTarget.y }

  if (p.enableStraightPath) {
    const straightPathPoints = tryFindStraightPath(
      {
        position: {
          x: p.sourceAbsolutePosition.x,
          y: p.sourceAbsolutePosition.y,
        },
        width: p.sourceSize.width,
        height: p.sourceSize.height,
        direction: p.sourcePosition,
      },
      {
        position: {
          x: p.targetAbsolutePosition.x,
          y: p.targetAbsolutePosition.y,
        },
        width: p.targetSize.width,
        height: p.targetSize.height,
        direction: p.targetPosition,
      },
      p.padding,
      {
        sourceX: routeSource.x,
        sourceY: routeSource.y,
        targetX: routeTarget.x,
        targetY: routeTarget.y,
      }
    )
    const hardObstacles = p.obstacles.filter((o) => !o.soft)
    if (
      straightPathPoints !== null &&
      !routeCrossesHardObstacle(straightPathPoints, p.obstacles) &&
      straightPathClearsBodies(straightPathPoints, hardObstacles) &&
      !routeConflictsWithNeighborEdges(straightPathPoints, p.neighborEdges)
    ) {
      return removeDuplicatePoints(straightPathPoints)
    }
  }

  return routeOrthogonalPath(
    routeSource,
    routeTarget,
    p.sourcePosition,
    p.targetPosition,
    p.obstacles,
    p.neighborEdges
  )
}
