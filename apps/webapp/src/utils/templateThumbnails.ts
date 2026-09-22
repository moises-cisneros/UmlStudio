import type { UMLModel } from "@umlstudio/core"
import { renderThumbnailSvgFromModel } from "@/utils/thumbnailSvg"
import { waitForIdle } from "@/utils/idle"
import { log } from "@/logger"
import { prepareTemplateModel } from "@/utils/templateModels"

const templateSvgCache = new Map<string, string | null>()

type Listener = (name: string, lightSvg: string | null) => void
const listeners = new Set<Listener>()

const pendingQueue: string[] = []
const queuedNames = new Set<string>()
let workerActive = false

const importTemplateModel = async (name: string): Promise<UMLModel> => {
  const jsonModule = await import(`assets/diagramTemplates/${name}.json`)
  const jsonData = jsonModule.default
  if (!jsonData) {
    throw new Error(`Template "${name}" not found`)
  }
  return prepareTemplateModel(jsonData as UMLModel)
}

const notify = (name: string, lightSvg: string | null) => {
  for (const listener of listeners) {
    listener(name, lightSvg)
  }
}

const runWorker = async () => {
  if (workerActive) return
  workerActive = true

  while (pendingQueue.length > 0) {
    const name = pendingQueue.shift()
    if (!name) continue
    queuedNames.delete(name)
    if (templateSvgCache.has(name)) continue

    await waitForIdle()

    try {
      const model = await importTemplateModel(name)
      const svg = await renderThumbnailSvgFromModel(model)
      templateSvgCache.set(name, svg)
      notify(name, svg)
    } catch (error) {
      templateSvgCache.set(name, null)
      notify(name, null)
      log.error(`Failed to render template thumbnail "${name}"`, error as Error)
    }
  }

  workerActive = false
}

export const getResolvedTemplateSvg = (name: string): string | null | undefined =>
  templateSvgCache.get(name)

export const requestTemplateThumbnail = (name: string) => {
  if (templateSvgCache.has(name) || queuedNames.has(name)) return
  queuedNames.add(name)
  pendingQueue.push(name)
  void runWorker()
}

export const subscribeTemplateThumbnails = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
