import { ReactFlowInstance, type Node, type Edge, Rect } from "@xyflow/react"
import { CSS_VARIABLE_FALLBACKS, LAYOUT, STROKE_COLOR } from "@/constants"
import { DEFAULT_FONT_SIZE, FONT_FAMILY } from "@/fontStack"
import { Point } from "./pathParsing"
import { measureTextWidth } from "./textUtils"

const svgFontStyles = `
    text {
      font-family: ${FONT_FAMILY};
    }
  `

type SvgExportMode = "web" | "compat"

type ExportFilterOptions = {
  include?: string[]
  exclude?: string[]
  svgMode?: SvgExportMode
}

function shouldRenderElement(elementId: string | null, options?: ExportFilterOptions): boolean {
  if (!elementId) {
    return true
  }

  if (options?.include && options.include.length > 0) {
    return options.include.includes(elementId)
  }

  if (options?.exclude && options.exclude.length > 0) {
    return !options.exclude.includes(elementId)
  }

  return true
}

export function filterRenderedElements(
  container: HTMLElement,
  options?: ExportFilterOptions
): void {
  if (!options?.include?.length && !options?.exclude?.length) {
    return
  }

  container.querySelectorAll(".react-flow__node, .react-flow__edge").forEach((element) => {
    const elementId = element.getAttribute("data-id") || element.id || null
    if (!shouldRenderElement(elementId, options)) {
      element.remove()
    }
  })
}

export const getSVG = (
  container: HTMLElement,
  clip: Rect,
  options?: ExportFilterOptions,
  fontFaceCss?: string
): string => {
  const emptySVG = "<svg></svg>"

  const width = clip.width
  const height = clip.height

  const svgMode = options?.svgMode ?? "web"
  const vp = container.querySelector(".react-flow__viewport")

  if (!vp) return emptySVG

  const SVG_NS = "http://www.w3.org/2000/svg"
  const mainSVG = document.createElementNS(SVG_NS, "svg")
  mainSVG.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  const styleEl = document.createElementNS(SVG_NS, "style")
  styleEl.textContent = svgFontStyles
  mainSVG.appendChild(styleEl)
  mainSVG.setAttribute("viewBox", `${clip.x} ${clip.y} ${width} ${height}`)
  mainSVG.setAttribute("width", `${width}`)
  mainSVG.setAttribute("height", `${height}`)
  mainSVG.setAttribute("shape-rendering", "geometricPrecision")

  const MainNodesGTag = document.createElementNS(SVG_NS, "g")
  mainSVG.appendChild(MainNodesGTag)
  const allNodes = vp.querySelectorAll(".react-flow__node")

  allNodes.forEach((node) => {
    const styles = extractStyles(node.getAttribute("style") ?? "")
    const newGTagForNode = document.createElementNS(SVG_NS, "g")
    const svgElement = node.querySelector("svg")

    newGTagForNode.setAttribute(
      "transform",
      `translate(${styles.transform.x}, ${styles.transform.y})`
    )
    if (svgElement) {
      const clonedSvg = svgElement.cloneNode(true) as Element
      clonedSvg.querySelectorAll(".react-flow__handle")?.forEach((el) => el.remove())
      newGTagForNode.appendChild(clonedSvg)
    }
    MainNodesGTag.appendChild(newGTagForNode)
  })

  const allEdgeElements = vp.querySelectorAll(".react-flow__edge")

  const MainEdgesGTag = document.createElementNS(SVG_NS, "g")
  mainSVG.appendChild(MainEdgesGTag)

  const uiOnlyClasses = [
    "edge-circle",
    "edge-overlay",
    "edge-container",
    "react-flow__edge-interaction",
    "react-flow__edgeupdater",
    "react-flow__edgeupdater-source",
    "react-flow__edgeupdater-target",
    "target-edge-marker-grab",
  ]

  allEdgeElements.forEach((edgeContainer) => {
    const edgePaths = edgeContainer.querySelectorAll(".react-flow__edge-path")
    edgePaths.forEach((path) => {
      const clonedPath = path.cloneNode(true) as Element

      if (!clonedPath.getAttribute("stroke-width")) {
        clonedPath.setAttribute("stroke-width", String(LAYOUT.LINE_WIDTH_EDGE))
      }

      if (!clonedPath.getAttribute("stroke")) {
        const styleAttr = clonedPath.getAttribute("style") || ""
        const strokeMatch = styleAttr.match(/stroke:\s*([^;]+)/)
        if (strokeMatch) {
          clonedPath.setAttribute("stroke", strokeMatch[1].trim())
        } else {
          clonedPath.setAttribute("stroke", STROKE_COLOR)
        }
      }

      if (!clonedPath.getAttribute("fill")) {
        clonedPath.setAttribute("fill", "none")
      }

      clonedPath.setAttribute("opacity", "1")
      clonedPath.setAttribute("stroke-opacity", "1")

      MainEdgesGTag.appendChild(clonedPath)
    })

    const connectorLines = edgeContainer.querySelectorAll(
      "line[data-testid*='association-class-connector'], line"
    )
    connectorLines.forEach((line) => {
      const clonedLine = line.cloneNode(true) as Element

      if (!clonedLine.getAttribute("stroke-width")) {
        clonedLine.setAttribute("stroke-width", "1.5")
      }

      if (!clonedLine.getAttribute("stroke")) {
        const styleAttr = clonedLine.getAttribute("style") || ""
        const strokeMatch = styleAttr.match(/stroke:\s*([^;]+)/)
        if (strokeMatch) {
          clonedLine.setAttribute("stroke", strokeMatch[1].trim())
        } else {
          clonedLine.setAttribute("stroke", STROKE_COLOR)
        }
      }

      if (!clonedLine.getAttribute("stroke-dasharray")) {
        clonedLine.setAttribute("stroke-dasharray", "6 4")
      }

      clonedLine.setAttribute("opacity", "1")
      clonedLine.setAttribute("stroke-opacity", "1")

      MainEdgesGTag.appendChild(clonedLine)
    })

    const inlineMarkers = edgeContainer.querySelectorAll("[data-inline-marker]")
    inlineMarkers.forEach((marker) => {
      MainEdgesGTag.appendChild(marker.cloneNode(true))
    })

    const labelGroups = edgeContainer.querySelectorAll(
      ".react-flow__edge-text, .react-flow__edge-textwrapper, .edge-labels"
    )
    labelGroups.forEach((group) => {
      const cloned = group.cloneNode(true) as Element
      uiOnlyClasses.forEach((cls) => {
        cloned.querySelectorAll?.(`.${cls}`)?.forEach((el) => el.remove())
      })
      MainEdgesGTag.appendChild(cloned)
    })

    const textElements = edgeContainer.querySelectorAll("text")
    textElements.forEach((text) => {
      const isInsideLabelGroup = Array.from(labelGroups).some((group) => group.contains(text))

      if (!isInsideLabelGroup) {
        MainEdgesGTag.appendChild(text.cloneNode(true))
      }
    })
  })

  if (svgMode === "compat") {
    replaceCSSVariables(mainSVG)
    convertStyleToAttributes(mainSVG)
    ensureTextFontDefaults(mainSVG)
    resolveRelativeFontSizes(mainSVG)
    resolveTspanDy(mainSVG)
    resolveDominantBaseline(mainSVG)
    if (fontFaceCss) embedFontFaceCss(mainSVG, fontFaceCss)
    removeMarkerElements(mainSVG)
    replaceTextDecorationWithManualUnderline(mainSVG)
  }

  return mainSVG.outerHTML
}

const BASELINE_SHIFT_EM: Record<string, number> = {
  middle: 0.25,
  central: 0.35,
  hanging: 0.75,
}

function extractPathPoints(pathD: string): Point[] {
  if (!pathD) return []

  const points: Point[] = []
  const commands = pathD.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? []

  let currentX = 0
  let currentY = 0
  let lastControlX = 0
  let lastControlY = 0
  let lastCommandType = ""

  for (const cmd of commands) {
    const type = cmd[0]
    const isRelative = type === type.toLowerCase()
    const absType = type.toUpperCase()
    const params =
      cmd
        .slice(1)
        .match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)
        ?.map(Number) ?? []

    switch (absType) {
      case "M":
      case "L":
        for (let i = 0; i + 1 < params.length; i += 2) {
          if (isRelative) {
            currentX += params[i]
            currentY += params[i + 1]
          } else {
            currentX = params[i]
            currentY = params[i + 1]
          }
          points.push({ x: currentX, y: currentY })
        }
        lastControlX = currentX
        lastControlY = currentY
        break

      case "H":
        for (const x of params) {
          currentX = isRelative ? currentX + x : x
          points.push({ x: currentX, y: currentY })
        }
        lastControlX = currentX
        lastControlY = currentY
        break

      case "V":
        for (const y of params) {
          currentY = isRelative ? currentY + y : y
          points.push({ x: currentX, y: currentY })
        }
        lastControlX = currentX
        lastControlY = currentY
        break

      case "C":
        for (let i = 0; i + 5 < params.length; i += 6) {
          const cp1x = isRelative ? currentX + params[i] : params[i]
          const cp1y = isRelative ? currentY + params[i + 1] : params[i + 1]
          const cp2x = isRelative ? currentX + params[i + 2] : params[i + 2]
          const cp2y = isRelative ? currentY + params[i + 3] : params[i + 3]
          const endX = isRelative ? currentX + params[i + 4] : params[i + 4]
          const endY = isRelative ? currentY + params[i + 5] : params[i + 5]

          points.push({ x: cp1x, y: cp1y })
          points.push({ x: cp2x, y: cp2y })
          points.push({ x: endX, y: endY })

          lastControlX = cp2x
          lastControlY = cp2y
          currentX = endX
          currentY = endY
        }
        break

      case "S":
        for (let i = 0; i + 3 < params.length; i += 4) {
          let cp1x: number, cp1y: number
          if (lastCommandType === "C" || lastCommandType === "S") {
            cp1x = 2 * currentX - lastControlX
            cp1y = 2 * currentY - lastControlY
          } else {
            cp1x = currentX
            cp1y = currentY
          }

          const cp2x = isRelative ? currentX + params[i] : params[i]
          const cp2y = isRelative ? currentY + params[i + 1] : params[i + 1]
          const endX = isRelative ? currentX + params[i + 2] : params[i + 2]
          const endY = isRelative ? currentY + params[i + 3] : params[i + 3]

          points.push({ x: cp1x, y: cp1y })
          points.push({ x: cp2x, y: cp2y })
          points.push({ x: endX, y: endY })

          lastControlX = cp2x
          lastControlY = cp2y
          currentX = endX
          currentY = endY
        }
        break

      case "Q":
        for (let i = 0; i + 3 < params.length; i += 4) {
          const cpx = isRelative ? currentX + params[i] : params[i]
          const cpy = isRelative ? currentY + params[i + 1] : params[i + 1]
          const endX = isRelative ? currentX + params[i + 2] : params[i + 2]
          const endY = isRelative ? currentY + params[i + 3] : params[i + 3]

          points.push({ x: cpx, y: cpy })
          points.push({ x: endX, y: endY })

          lastControlX = cpx
          lastControlY = cpy
          currentX = endX
          currentY = endY
        }
        break

      case "T":
        for (let i = 0; i + 1 < params.length; i += 2) {
          let cpx: number, cpy: number
          if (lastCommandType === "Q" || lastCommandType === "T") {
            cpx = 2 * currentX - lastControlX
            cpy = 2 * currentY - lastControlY
          } else {
            cpx = currentX
            cpy = currentY
          }

          const endX = isRelative ? currentX + params[i] : params[i]
          const endY = isRelative ? currentY + params[i + 1] : params[i + 1]

          points.push({ x: cpx, y: cpy })
          points.push({ x: endX, y: endY })

          lastControlX = cpx
          lastControlY = cpy
          currentX = endX
          currentY = endY
        }
        break

      case "A":
        for (let i = 0; i + 6 < params.length; i += 7) {
          const rx = params[i]
          const ry = params[i + 1]
          const endX = isRelative ? currentX + params[i + 5] : params[i + 5]
          const endY = isRelative ? currentY + params[i + 6] : params[i + 6]

          points.push({ x: endX, y: endY })

          const midX = (currentX + endX) / 2
          const midY = (currentY + endY) / 2
          points.push({ x: midX - rx, y: midY })
          points.push({ x: midX + rx, y: midY })
          points.push({ x: midX, y: midY - ry })
          points.push({ x: midX, y: midY + ry })

          currentX = endX
          currentY = endY
        }
        lastControlX = currentX
        lastControlY = currentY
        break

      case "Z":
        lastControlX = currentX
        lastControlY = currentY
        break
    }

    lastCommandType = absType
  }

  return points
}

function getNodeBoundsFromDOM(
  container: HTMLElement,
  reactFlow?: ReactFlowInstance<Node, Edge>
): Rect | undefined {
  const nodeElements = container.querySelectorAll(".react-flow__node")

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let foundNode = false

  nodeElements.forEach((nodeEl) => {
    const styleStr = nodeEl.getAttribute("style") ?? ""
    const styles = extractStyles(styleStr)
    const svgElement = nodeEl.querySelector("svg")
    const renderedSvgRect = svgElement?.getBoundingClientRect()
    const measuredWidth =
      renderedSvgRect && renderedSvgRect.width > 0 ? renderedSvgRect.width : undefined
    const measuredHeight =
      renderedSvgRect && renderedSvgRect.height > 0 ? renderedSvgRect.height : undefined
    if (svgElement) {
      const viewBox = svgElement.getAttribute("viewBox")
      if (viewBox) {
        const viewBoxParts = viewBox.split(/[\s,]+/).map(Number)
        if (viewBoxParts.length >= 4) {
          const [vbX, vbY, vbW, vbH] = viewBoxParts
          const svgWidth = measuredWidth ?? parseFloat(svgElement.getAttribute("width") ?? `${vbW}`)
          const svgHeight =
            measuredHeight ?? parseFloat(svgElement.getAttribute("height") ?? `${vbH}`)

          if (Number.isFinite(svgWidth) && Number.isFinite(svgHeight) && vbW !== 0 && vbH !== 0) {
            try {
              const bbox = (svgElement as SVGGraphicsElement).getBBox()
              if (
                Number.isFinite(bbox.x) &&
                Number.isFinite(bbox.y) &&
                Number.isFinite(bbox.width) &&
                Number.isFinite(bbox.height) &&
                (bbox.width > 0 || bbox.height > 0)
              ) {
                const scaleX = svgWidth / vbW
                const scaleY = svgHeight / vbH
                const bboxX = styles.transform.x + (bbox.x - vbX) * scaleX
                const bboxY = styles.transform.y + (bbox.y - vbY) * scaleY
                const bboxMaxX = styles.transform.x + (bbox.x + bbox.width - vbX) * scaleX
                const bboxMaxY = styles.transform.y + (bbox.y + bbox.height - vbY) * scaleY

                foundNode = true
                minX = Math.min(minX, bboxX)
                minY = Math.min(minY, bboxY)
                maxX = Math.max(maxX, bboxMaxX)
                maxY = Math.max(maxY, bboxMaxY)
                return
              }
            } catch {
              /* ignore fallback */
            }
          }
        }
      }
    }

    if (renderedSvgRect && reactFlow) {
      const topLeft = reactFlow.screenToFlowPosition({
        x: renderedSvgRect.left,
        y: renderedSvgRect.top,
      })
      const bottomRight = reactFlow.screenToFlowPosition({
        x: renderedSvgRect.right,
        y: renderedSvgRect.bottom,
      })

      if (
        Number.isFinite(topLeft.x) &&
        Number.isFinite(topLeft.y) &&
        Number.isFinite(bottomRight.x) &&
        Number.isFinite(bottomRight.y)
      ) {
        foundNode = true
        minX = Math.min(minX, topLeft.x)
        minY = Math.min(minY, topLeft.y)
        maxX = Math.max(maxX, bottomRight.x)
        maxY = Math.max(maxY, bottomRight.y)
        return
      }
    }

    const width = measuredWidth ?? parseFloat(styles.width ?? "")
    const height = measuredHeight ?? parseFloat(styles.height ?? "")

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return
    }

    foundNode = true
    minX = Math.min(minX, styles.transform.x)
    minY = Math.min(minY, styles.transform.y)
    maxX = Math.max(maxX, styles.transform.x + width)
    maxY = Math.max(maxY, styles.transform.y + height)
  })

  if (!foundNode) {
    return undefined
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getEdgeBoundsFromDOM(container: HTMLElement): Rect | undefined {
  const edgePaths = container.querySelectorAll(".react-flow__edge-path")
  const allPoints: Point[] = []
  let maxStrokeWidth = 0

  edgePaths.forEach((path) => {
    const d = path.getAttribute("d")
    if (d) {
      allPoints.push(...extractPathPoints(d))
    }
    const strokeWidth = parseFloat(
      path.getAttribute("stroke-width") ?? String(LAYOUT.LINE_WIDTH_EDGE)
    )
    if (strokeWidth > maxStrokeWidth) {
      maxStrokeWidth = strokeWidth
    }
  })

  const markers = container.querySelectorAll("[data-inline-marker]")
  markers.forEach((marker) => {
    const tagName = marker.tagName.toLowerCase()

    if (tagName === "path") {
      const d = marker.getAttribute("d")
      if (d) {
        allPoints.push(...extractPathPoints(d))
      }
    } else if (tagName === "circle") {
      const cx = parseFloat(marker.getAttribute("cx") ?? "0")
      const cy = parseFloat(marker.getAttribute("cy") ?? "0")
      const r = parseFloat(marker.getAttribute("r") ?? "0")
      const strokeWidth = parseFloat(marker.getAttribute("stroke-width") ?? "0")
      const totalRadius = r + strokeWidth / 2

      allPoints.push({ x: cx - totalRadius, y: cy - totalRadius })
      allPoints.push({ x: cx + totalRadius, y: cy + totalRadius })
    }

    const strokeWidth = parseFloat(marker.getAttribute("stroke-width") ?? "0")
    if (strokeWidth > maxStrokeWidth) {
      maxStrokeWidth = strokeWidth
    }
  })

  const connectorLines = container.querySelectorAll(
    "line[data-testid*='association-class-connector'], line"
  )
  connectorLines.forEach((line) => {
    const x1 = parseFloat(line.getAttribute("x1") ?? "")
    const y1 = parseFloat(line.getAttribute("y1") ?? "")
    const x2 = parseFloat(line.getAttribute("x2") ?? "")
    const y2 = parseFloat(line.getAttribute("y2") ?? "")
    if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
      allPoints.push({ x: x1, y: y1 }, { x: x2, y: y2 })
    }
    const strokeWidth = parseFloat(line.getAttribute("stroke-width") ?? "1.5")
    if (strokeWidth > maxStrokeWidth) {
      maxStrokeWidth = strokeWidth
    }
  })

  if (allPoints.length === 0) {
    return undefined
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const p of allPoints) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const strokeExpansion = maxStrokeWidth / 2
  minX -= strokeExpansion
  minY -= strokeExpansion
  maxX += strokeExpansion
  maxY += strokeExpansion

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getNodeOverflowBoundsFromDOM(container: HTMLElement): Rect | undefined {
  const allNodes = container.querySelectorAll(".react-flow__node")
  const overflowPoints: Point[] = []

  allNodes.forEach((node) => {
    const styleStr = node.getAttribute("style") ?? ""
    const styles = extractStyles(styleStr)
    const nodeX = styles.transform.x
    const nodeY = styles.transform.y

    const svgEl = node.querySelector("svg")
    if (!svgEl) return

    const vb = svgEl.getAttribute("viewBox")
    if (!vb) return
    const vbParts = vb.split(/[\s,]+/).map(Number)
    if (vbParts.length < 4) return
    const [vbX, vbY, vbW, vbH] = vbParts

    const svgW = parseFloat(svgEl.getAttribute("width") ?? `${vbW}`)
    const svgH = parseFloat(svgEl.getAttribute("height") ?? `${vbH}`)
    const scaleX = svgW / vbW
    const scaleY = svgH / vbH

    const toGlobal = (lx: number, ly: number): Point => ({
      x: nodeX + (lx - vbX) * scaleX,
      y: nodeY + (ly - vbY) * scaleY,
    })

    const isOverflow = (lx: number, ly: number) =>
      lx < vbX || ly < vbY || lx > vbX + vbW || ly > vbY + vbH

    svgEl.querySelectorAll("line").forEach((line) => {
      const x1 = parseFloat(line.getAttribute("x1") ?? "0")
      const y1 = parseFloat(line.getAttribute("y1") ?? "0")
      const x2 = parseFloat(line.getAttribute("x2") ?? "0")
      const y2 = parseFloat(line.getAttribute("y2") ?? "0")

      if (isOverflow(x1, y1) || isOverflow(x2, y2)) {
        overflowPoints.push(toGlobal(x1, y1))
        overflowPoints.push(toGlobal(x2, y2))
      }
    })

    svgEl.querySelectorAll("path").forEach((path) => {
      const d = path.getAttribute("d")
      if (!d) return
      const pathPoints = extractPathPoints(d)
      const hasOverflow = pathPoints.some((p) => isOverflow(p.x, p.y))
      if (hasOverflow) {
        pathPoints.forEach((p) => overflowPoints.push(toGlobal(p.x, p.y)))
      }
    })

    svgEl.querySelectorAll("polyline").forEach((polyline) => {
      const pointsAttr = polyline.getAttribute("points")
      if (!pointsAttr) return
      const coords = pointsAttr
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      for (let i = 0; i + 1 < coords.length; i += 2) {
        const lx = coords[i]
        const ly = coords[i + 1]
        if (isOverflow(lx, ly)) {
          for (let j = 0; j + 1 < coords.length; j += 2) {
            overflowPoints.push(toGlobal(coords[j], coords[j + 1]))
          }
          break
        }
      }
    })

    svgEl.querySelectorAll("circle").forEach((circle) => {
      const cx = parseFloat(circle.getAttribute("cx") ?? "0")
      const cy = parseFloat(circle.getAttribute("cy") ?? "0")
      const r = parseFloat(circle.getAttribute("r") ?? "0")

      if (isOverflow(cx - r, cy - r) || isOverflow(cx + r, cy + r)) {
        overflowPoints.push(toGlobal(cx - r, cy - r))
        overflowPoints.push(toGlobal(cx + r, cy + r))
      }
    })
  })

  if (overflowPoints.length === 0) return undefined

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const p of overflowPoints) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

const BASELINE_EXTENTS: Record<"middle" | "alphabetic", { up: number; down: number }> = {
  middle: { up: 0.75, down: 0.75 },
  alphabetic: { up: 0.9, down: 0.3 },
}

function parseRotateTransform(
  transform: string | null
): { angleRad: number; cx: number; cy: number } | undefined {
  if (!transform) return undefined
  const match = transform.match(/rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/)
  if (!match) return undefined
  const angleDeg = parseFloat(match[1])
  if (!Number.isFinite(angleDeg) || angleDeg === 0) return undefined
  const cx = match[2] !== undefined ? parseFloat(match[2]) : 0
  const cy = match[3] !== undefined ? parseFloat(match[3]) : 0
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return undefined
  return { angleRad: (angleDeg * Math.PI) / 180, cx, cy }
}

function mergeEdgeTextBoundsFromAttributes(
  textEl: SVGTextElement,
  mergeRect: (x1: number, y1: number, x2: number, y2: number) => void
): void {
  const text = textEl.textContent ?? ""
  if (!text.trim()) return

  const x = parseFloat(textEl.getAttribute("x") ?? "")
  const y = parseFloat(textEl.getAttribute("y") ?? "")
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  const fontSize =
    parseFloat(textEl.getAttribute("font-size") || textEl.style.fontSize) || DEFAULT_FONT_SIZE
  const fontWeight = textEl.getAttribute("font-weight") || textEl.style.fontWeight || "400"
  const width = measureTextWidth(text, `${fontWeight} ${fontSize}px ${FONT_FAMILY}`)

  const anchor = textEl.getAttribute("text-anchor")
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x
  const right = left + width

  const dominantBaseline = textEl.getAttribute("dominant-baseline") || textEl.style.dominantBaseline
  const baseline =
    dominantBaseline === "middle" || dominantBaseline === "central" ? "middle" : "alphabetic"
  const { up, down } = BASELINE_EXTENTS[baseline]
  const top = y - fontSize * up
  const bottom = y + fontSize * down

  const rotation = parseRotateTransform(textEl.getAttribute("transform"))
  if (!rotation) {
    mergeRect(left, top, right, bottom)
    return
  }

  const { angleRad, cx, cy } = rotation
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const rotate = (px: number, py: number) => {
    const dx = px - cx
    const dy = py - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  }
  const corners = [
    rotate(left, top),
    rotate(right, top),
    rotate(right, bottom),
    rotate(left, bottom),
  ]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  mergeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
}

function getTextBoundsFromDOM(
  container: HTMLElement,
  reactFlow: ReactFlowInstance<Node, Edge>
): Rect | undefined {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let foundVisibleText = false

  const mergeRect = (x1: number, y1: number, x2: number, y2: number) => {
    const localMinX = Math.min(x1, x2)
    const localMinY = Math.min(y1, y2)
    const localMaxX = Math.max(x1, x2)
    const localMaxY = Math.max(y1, y2)

    if (
      !Number.isFinite(localMinX) ||
      !Number.isFinite(localMinY) ||
      !Number.isFinite(localMaxX) ||
      !Number.isFinite(localMaxY)
    ) {
      return
    }

    minX = Math.min(minX, localMinX)
    minY = Math.min(minY, localMinY)
    maxX = Math.max(maxX, localMaxX)
    maxY = Math.max(maxY, localMaxY)
    foundVisibleText = true
  }

  const nodeElements = container.querySelectorAll(".react-flow__node")
  nodeElements.forEach((nodeEl) => {
    const styleStr = nodeEl.getAttribute("style") ?? ""
    const styles = extractStyles(styleStr)
    const nodeX = styles.transform.x
    const nodeY = styles.transform.y

    const svgEl = nodeEl.querySelector("svg")
    if (!svgEl) return

    const viewBox = svgEl.getAttribute("viewBox")
    if (!viewBox) return

    const vbParts = viewBox.split(/[\s,]+/).map(Number)
    if (vbParts.length < 4) return
    const [vbX, vbY, vbW, vbH] = vbParts

    const svgW = parseFloat(svgEl.getAttribute("width") ?? `${vbW}`)
    const svgH = parseFloat(svgEl.getAttribute("height") ?? `${vbH}`)
    if (!Number.isFinite(svgW) || !Number.isFinite(svgH) || vbW === 0 || vbH === 0) {
      return
    }
    const scaleX = svgW / vbW
    const scaleY = svgH / vbH

    svgEl.querySelectorAll("text").forEach((textEl) => {
      try {
        const bbox = (textEl as SVGGraphicsElement).getBBox()
        if (
          !Number.isFinite(bbox.x) ||
          !Number.isFinite(bbox.y) ||
          !Number.isFinite(bbox.width) ||
          !Number.isFinite(bbox.height)
        ) {
          return
        }
        if (bbox.width === 0 && bbox.height === 0) {
          return
        }

        const x1 = nodeX + (bbox.x - vbX) * scaleX
        const y1 = nodeY + (bbox.y - vbY) * scaleY
        const x2 = nodeX + (bbox.x + bbox.width - vbX) * scaleX
        const y2 = nodeY + (bbox.y + bbox.height - vbY) * scaleY

        mergeRect(x1, y1, x2, y2)
      } catch {
        /* ignore invalid bounding box */
      }
    })
  })

  const edgeTextElements = container.querySelectorAll(".react-flow__edge text")
  edgeTextElements.forEach((textEl) => {
    try {
      const rect = (textEl as SVGGraphicsElement).getBoundingClientRect()
      if (
        !Number.isFinite(rect.left) ||
        !Number.isFinite(rect.top) ||
        !Number.isFinite(rect.right) ||
        !Number.isFinite(rect.bottom)
      ) {
        return
      }
      if (rect.width === 0 && rect.height === 0) {
        mergeEdgeTextBoundsFromAttributes(textEl as SVGTextElement, mergeRect)
        return
      }

      const corners = [
        reactFlow.screenToFlowPosition({ x: rect.left, y: rect.top }),
        reactFlow.screenToFlowPosition({ x: rect.right, y: rect.top }),
        reactFlow.screenToFlowPosition({ x: rect.left, y: rect.bottom }),
        reactFlow.screenToFlowPosition({ x: rect.right, y: rect.bottom }),
      ]
      const xs = corners.map((point) => point.x)
      const ys = corners.map((point) => point.y)

      mergeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
    } catch {
      /* ignore invalid edge text */
    }
  })

  if (!foundVisibleText) return undefined

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function mergeBounds(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function getRenderedDiagramBounds(
  reactFlow: ReactFlowInstance<Node, Edge>,
  container: HTMLElement
): Rect {
  let bounds = getNodeBoundsFromDOM(container, reactFlow)

  const edgeBounds = getEdgeBoundsFromDOM(container)
  if (bounds && edgeBounds) {
    bounds = mergeBounds(bounds, edgeBounds)
  } else if (!bounds && edgeBounds) {
    bounds = edgeBounds
  }

  const overflowBounds = getNodeOverflowBoundsFromDOM(container)
  if (bounds && overflowBounds) {
    bounds = mergeBounds(bounds, overflowBounds)
  } else if (!bounds && overflowBounds) {
    bounds = overflowBounds
  }

  const textBounds = getTextBoundsFromDOM(container, reactFlow)
  if (bounds && textBounds) {
    bounds = mergeBounds(bounds, textBounds)
  } else if (!bounds && textBounds) {
    bounds = textBounds
  }

  return bounds ?? { x: 0, y: 0, width: 0, height: 0 }
}

function extractStyles(styleString: string) {
  const transformMatch = styleString.match(
    /transform:\s*translate\((-?\d+\.?\d*)px,\s*(-?\d+\.?\d*)px\)/
  )
  const widthMatch = styleString.match(/width:\s*([^;]+)/)
  const heightMatch = styleString.match(/height:\s*([^;]+)/)

  const x = transformMatch ? parseFloat(transformMatch[1]) : 0
  const y = transformMatch ? parseFloat(transformMatch[2]) : 0

  return {
    transform: { x, y },
    width: widthMatch ? widthMatch[1].trim() : null,
    height: heightMatch ? heightMatch[1].trim() : null,
  }
}

const VARIABLE_REGEX = /var\((--[\w-]+)(?:\s*,\s*([^)]+(?:\([^)]*\)[^)]*)*))?\)/g

type CSSVariableMap = Readonly<Record<string, string>>

function resolveCSSVariable(value: string, cssVarMap?: CSSVariableMap): string {
  let result = value
  let prevResult = ""

  while (result !== prevResult && result.includes("var(")) {
    prevResult = result
    result = result.replace(VARIABLE_REGEX, (_match, variableName: string, fallback?: string) => {
      const trimmedName = variableName.trim()
      const mapped = cssVarMap?.[trimmedName]?.trim()
      if (mapped) {
        return mapped
      }
      const resolved = CSS_VARIABLE_FALLBACKS[trimmedName]
      if (resolved) return resolved

      if (fallback) {
        return fallback.trim()
      }

      return ""
    })
  }

  return result
}

function resolveCurrentColor(
  element: Element,
  inheritedColor: string,
  cssVarMap?: CSSVariableMap
): string {
  const colorAttr = element.getAttribute("color")
  if (colorAttr) {
    const resolvedColor = resolveCSSVariable(colorAttr, cssVarMap)
    if (resolvedColor && resolvedColor !== "currentColor") {
      return resolvedColor
    }
  }
  return inheritedColor
}

function replaceCSSVariables(
  node: Element | ChildNode,
  inheritedColor: string = STROKE_COLOR,
  cssVarMap?: CSSVariableMap
): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element

    const currentColor = resolveCurrentColor(element, inheritedColor, cssVarMap)

    const colorAttr = element.getAttribute("color")
    if (colorAttr) {
      const resolvedColor = resolveCSSVariable(colorAttr, cssVarMap)
      if (resolvedColor !== colorAttr) {
        element.setAttribute("color", resolvedColor)
      }
    }

    element.getAttributeNames().forEach((attr) => {
      const attrValue = element.getAttribute(attr)
      if (!attrValue) return

      let resolvedValue = resolveCSSVariable(attrValue, cssVarMap)

      if (resolvedValue === "currentColor") {
        resolvedValue = currentColor
      } else if (resolvedValue.includes("currentColor")) {
        resolvedValue = resolvedValue.replace(/currentColor/gi, currentColor)
      }

      if (resolvedValue === "context-stroke" || resolvedValue === "context-fill") {
        resolvedValue = currentColor
      }

      if (attr === "font-size" || attr === "fontSize") {
        if (/^\d+(\.\d+)?$/.test(resolvedValue)) {
          resolvedValue = `${resolvedValue}px`
        }
      }

      if (attr === "pointer-events" || attr === "pointerEvents") {
        element.removeAttribute(attr)
        return
      }

      if (resolvedValue !== attrValue) {
        element.setAttribute(attr, resolvedValue)
      }
    })

    Array.from(element.childNodes).forEach((child) =>
      replaceCSSVariables(child, currentColor, cssVarMap)
    )
  }
}

const SVG_STYLE_TO_ATTRIBUTE = [
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "fill",
  "fill-opacity",
  "opacity",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
] as const

function convertStyleToAttributes(node: Element | ChildNode): void {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  const element = node as Element
  const styleAttr = element.getAttribute("style")

  if (styleAttr) {
    const remainingStyles: string[] = []

    styleAttr.split(";").forEach((declaration) => {
      const [prop, value] = declaration.split(":").map((s) => s.trim())
      if (!prop || !value) return

      if (prop === "transition") return
      if (prop === "stroke-dasharray" && value === "0") return

      if (SVG_STYLE_TO_ATTRIBUTE.includes(prop as (typeof SVG_STYLE_TO_ATTRIBUTE)[number])) {
        if (!element.hasAttribute(prop)) {
          element.setAttribute(prop, value)
        }
      } else {
        remainingStyles.push(`${prop}: ${value}`)
      }
    })

    if (remainingStyles.length > 0) {
      element.setAttribute("style", remainingStyles.join("; "))
    } else {
      element.removeAttribute("style")
    }
  }

  Array.from(element.childNodes).forEach(convertStyleToAttributes)
}

const TEXT_FONT_DEFAULTS = {
  "font-size": `${DEFAULT_FONT_SIZE}px`,
  "font-weight": "400",
  "font-family": FONT_FAMILY,
} as const

function ensureTextFontDefaults(svg: Element): void {
  svg.querySelectorAll("text").forEach((textEl) => {
    for (const [attr, defaultValue] of Object.entries(TEXT_FONT_DEFAULTS)) {
      if (!textEl.hasAttribute(attr)) {
        textEl.setAttribute(attr, defaultValue)
      }
    }
  })
}

function resolveRelativeFontSizes(el: Element, inheritedPx = DEFAULT_FONT_SIZE) {
  let resolvedPx = inheritedPx
  const raw = el.getAttribute("font-size")?.trim()
  const match = raw?.match(/^(\d*\.?\d+)(%|em|px)?$/)
  if (match) {
    const value = parseFloat(match[1])
    if (match[2] === "%") resolvedPx = (inheritedPx * value) / 100
    else if (match[2] === "em") resolvedPx = inheritedPx * value
    else resolvedPx = value
    el.setAttribute("font-size", `${resolvedPx}px`)
  }
  for (const child of Array.from(el.children)) {
    resolveRelativeFontSizes(child, resolvedPx)
  }
}

function resolveTspanDy(svg: Element): void {
  svg.querySelectorAll("text").forEach((textEl) => {
    let currentY = parseFloat(textEl.getAttribute("y") ?? "0") || 0
    let seenDy = false
    textEl.querySelectorAll("tspan").forEach((tspan) => {
      const y = tspan.getAttribute("y")
      if (y !== null) currentY = parseFloat(y) || currentY
      const dy = tspan.getAttribute("dy")
      if (dy !== null) {
        currentY += parseFloat(dy) || 0
        seenDy = true
      }
      if (seenDy) {
        tspan.setAttribute("y", `${currentY}`)
        tspan.removeAttribute("dy")
      }
    })
  })
}

function resolveDominantBaseline(svg: Element): void {
  svg.querySelectorAll("text").forEach((textEl) => {
    const parentBaseline = textEl.getAttribute("dominant-baseline")
    const textFontSize = parseFloat(textEl.getAttribute("font-size") ?? "") || DEFAULT_FONT_SIZE
    const shift = (el: Element, fallbackY: number) => {
      const baseline = el.getAttribute("dominant-baseline") ?? parentBaseline
      const shiftEm = baseline ? BASELINE_SHIFT_EM[baseline] : undefined
      if (shiftEm === undefined) return

      const fontSize = parseFloat(el.getAttribute("font-size") ?? "") || textFontSize
      const parsedY = parseFloat(el.getAttribute("y") ?? "")
      const y = isNaN(parsedY) ? fallbackY : parsedY
      el.setAttribute("y", `${y + shiftEm * fontSize}`)
      el.removeAttribute("dominant-baseline")
    }

    const tspans = Array.from(textEl.querySelectorAll("tspan"))
    const textY = parseFloat(textEl.getAttribute("y") ?? "0") || 0
    if (tspans.length) {
      tspans.forEach((tspan) => shift(tspan, textY))
    } else {
      shift(textEl, 0)
    }
    textEl.removeAttribute("dominant-baseline")
  })
}

function replaceTextDecorationWithManualUnderline(svg: SVGSVGElement): void {
  const SVG_NS = "http://www.w3.org/2000/svg"
  const underlinedTexts = svg.querySelectorAll('text[text-decoration="underline"]')

  if (underlinedTexts.length === 0) return

  svg.style.position = "absolute"
  svg.style.left = "-9999px"
  svg.style.top = "-9999px"
  document.body.appendChild(svg)

  try {
    underlinedTexts.forEach((textEl) => {
      textEl.removeAttribute("text-decoration")

      const bbox = (textEl as SVGTextElement).getBBox()

      const line = document.createElementNS(SVG_NS, "line")
      const underlineY = bbox.y + bbox.height
      line.setAttribute("x1", String(bbox.x))
      line.setAttribute("x2", String(bbox.x + bbox.width))
      line.setAttribute("y1", String(underlineY))
      line.setAttribute("y2", String(underlineY))
      line.setAttribute("stroke", textEl.getAttribute("fill") || STROKE_COLOR)
      line.setAttribute("stroke-width", "1.2")

      textEl.parentNode?.insertBefore(line, textEl.nextSibling)
    })
  } finally {
    document.body.removeChild(svg)
    svg.style.removeProperty("position")
    svg.style.removeProperty("left")
    svg.style.removeProperty("top")
  }
}

function embedFontFaceCss(svg: SVGSVGElement, css: string): void {
  if (svg.querySelector("style[data-umlstudio-fonts]")) return

  const SVG_NS = "http://www.w3.org/2000/svg"
  const styleEl = document.createElementNS(SVG_NS, "style")
  styleEl.setAttribute("data-umlstudio-fonts", "")
  styleEl.textContent = css

  svg.insertBefore(styleEl, svg.firstChild)
}

function removeMarkerElements(svg: Element): void {
  svg.querySelectorAll("marker").forEach((el) => el.remove())
  svg.querySelectorAll("[marker-start]").forEach((el) => el.removeAttribute("marker-start"))
  svg.querySelectorAll("[marker-end]").forEach((el) => el.removeAttribute("marker-end"))
}

export const __testing = {
  embedFontFaceCss,
  filterRenderedElements,
  getRenderedDiagramBounds,
  extractPathPoints,
  extractStyles,
  resolveCSSVariable,
  replaceCSSVariables,
  convertStyleToAttributes,
  ensureTextFontDefaults,
  resolveRelativeFontSizes,
  resolveTspanDy,
  resolveDominantBaseline,
  removeMarkerElements,
  replaceTextDecorationWithManualUnderline,
  mergeBounds,
  getNodeBoundsFromDOM,
  getNodeOverflowBoundsFromDOM,
} as const
