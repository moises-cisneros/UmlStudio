import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { importDiagram, importXmiDiagram, type UMLModel } from "@umlstudio/core"
import { toast } from "react-toastify"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { log } from "@/logger"
import { uploadImageForVision, validateVisionModel } from "@/components/vision/visionImport"

export function useImportDiagramFile() {
  const createModel = usePersistenceModelStore((state) => state.createModel)
  const navigate = useNavigate()

  return useCallback(
    async (file: File) => {
      try {
        const lowerName = file.name.toLowerCase()
        const isJson = lowerName.endsWith(".json") || file.type.includes("json")
        const isXmi =
          lowerName.endsWith(".xmi") || lowerName.endsWith(".xml") || file.type.includes("xml")
        const isImage =
          lowerName.endsWith(".png") ||
          lowerName.endsWith(".jpg") ||
          lowerName.endsWith(".jpeg") ||
          lowerName.endsWith(".webp") ||
          file.type.startsWith("image/")

        if (!isJson && !isXmi && !isImage) {
          throw new Error(
            "Only UmlStudio JSON (.json), Enterprise Architect XMI (.xmi, .xml), and Images (.png, .jpg, .webp) are supported."
          )
        }

        let model: UMLModel

        if (isJson) {
          const text = await file.text()
          const parsed = JSON.parse(text)
          model = importDiagram(parsed) as UMLModel
          if (!model.title) {
            model.title = file.name.replace(/\.[^/.]+$/, "")
          }
        } else if (isXmi) {
          const text = await file.text()
          model = importXmiDiagram(text, {
            defaultTitle: file.name.replace(/\.[^/.]+$/, ""),
          })
        } else {
          toast.info(`Analyzing "${file.name}" with Vision AI...`)
          const result = await uploadImageForVision(file)
          const validation = validateVisionModel(result.model)
          if (!validation.valid) {
            throw new Error(`Invalid model extracted: ${validation.errors[0]}`)
          }
          model = result.model
          if (!model.title) {
            model.title = file.name.replace(/\.[^/.]+$/, "")
          }
        }

        // Canonical UUID assignment to prevent ID collisions
        const newDiagramId = crypto.randomUUID()
        model.id = newDiagramId

        createModel(model)
        await navigate({
          to: "/local/$id",
          params: { id: newDiagramId },
          replace: true,
        })
        toast.success(`Imported "${model.title || "Untitled diagram"}".`)
      } catch (error) {
        log.error("Failed to import diagram file", error as Error)
        toast.error(
          `Couldn't import "${file.name}". Ensure it is a valid UmlStudio JSON, XMI, or UML diagram photo.`
        )
      }
    },
    [createModel, navigate]
  )
}
