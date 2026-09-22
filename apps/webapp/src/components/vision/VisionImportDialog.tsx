import { useCallback, useRef, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "@umlstudio/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@umlstudio/ui/components/dialog"
import { Field, FieldLabel } from "@umlstudio/ui/components/field"
import { Input } from "@umlstudio/ui/components/input"
import type { UMLModel } from "@umlstudio/core"
import { useEditorContext } from "@/contexts"
import { log } from "@/logger"
import {
  VISION_ACCEPTED_MIME,
  VisionImportError,
  formatConfidence,
  mergeVisionModel,
  uploadImageForVision,
  validateVisionModel,
  type VisionResponse,
} from "./visionImport"

type Phase = "idle" | "uploading" | "preview" | "merging"

interface VisionImportDialogProps {
  open: boolean
  onClose: () => void
  onMerged?: (added: { nodes: number; edges: number }) => void
}

function nodeLabel(model: UMLModel, id: string): string {
  const node = model.nodes.find((candidate) => candidate.id === id)
  const name = node?.data?.["name"]
  return typeof name === "string" && name.length > 0 ? name : id
}

function toastVisionError(err: unknown, fileName: string): void {
  if (err instanceof VisionImportError) {
    toast.error(`${err.message} ${err.hint}`)
    return
  }
  log.error("Vision import failed", err as Error)
  toast.error(`Could not import "${fileName}". Please try again.`)
}

export function VisionImportDialog({ open, onClose, onMerged }: VisionImportDialogProps) {
  const { editor } = useEditorContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [fileName, setFileName] = useState("")
  const [preview, setPreview] = useState<VisionResponse | null>(null)

  const busy = phase === "uploading" || phase === "merging"

  const reset = useCallback(() => {
    setPhase("idle")
    setFileName("")
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const handleCancel = () => {
    // FA-02: preview lives in local state only — cancel mutates nothing.
    reset()
    onClose()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPhase("uploading")
    try {
      const result = await uploadImageForVision(file)
      const validation = validateVisionModel(result.model)
      if (!validation.valid) {
        toast.error(
          `Import rejected: ${validation.errors[0]} Only UML class diagrams (OMG UML 2.5) are supported.`
        )
        setPhase("idle")
        setPreview(null)
        return
      }
      setPreview(result)
      setPhase("preview")
    } catch (err) {
      toastVisionError(err, file.name)
      setPhase("idle")
      setPreview(null)
    }
  }

  const handleConfirm = useCallback(() => {
    // FA-01: explicit confirm merges into the Yjs store via editor.model
    // (setter routes through diagramStore.setNodesAndEdges → reconcileYMap).
    if (!preview || phase !== "preview" || busy) return
    if (!editor) {
      toast.error("Editor is not available. Open a diagram and try again.")
      return
    }
    const validation = validateVisionModel(preview.model)
    if (!validation.valid) {
      toast.error(
        `Import rejected: ${validation.errors[0]} Only UML class diagrams (OMG UML 2.5) are supported.`
      )
      return
    }
    setPhase("merging")
    try {
      const current = editor.model
      const merged = mergeVisionModel(current, preview.model)
      // eslint-disable-next-line react-hooks/immutability
      editor.model = merged
      const added = {
        nodes: preview.model.nodes.length,
        edges: preview.model.edges.length,
      }
      toast.success(
        `Imported ${added.nodes} classe(s) and ${added.edges} relationship(s) from "${fileName}".`
      )
      onMerged?.(added)
      reset()
      onClose()
    } catch (err) {
      log.error("Vision merge failed", err as Error)
      toast.error("Could not merge the import. The diagram was not changed.")
      setPhase("preview")
    }
  }, [preview, phase, busy, editor, fileName, reset, onMerged, onClose])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import diagram photo</DialogTitle>
          <DialogDescription>
            Upload a photo of a UML class diagram (JPG, PNG, or WebP, max 10MB, min 640x480). Review
            the extracted preview, then confirm to merge it into the canvas.
          </DialogDescription>
        </DialogHeader>

        {phase !== "preview" ? (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="vision-image-input">Diagram photo</FieldLabel>
            <Input
              id="vision-image-input"
              ref={fileInputRef}
              type="file"
              accept={[...VISION_ACCEPTED_MIME, ".jpg", ".jpeg", ".png", ".webp"].join(",")}
              onChange={handleFileChange}
              disabled={busy}
            />
            {phase === "uploading" && (
              <p className="text-xs text-muted-foreground" role="status">
                Analyzing {fileName || "image"}…
              </p>
            )}
          </Field>
        ) : (
          preview && (
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Preview of {fileName} — nothing is added until you confirm.
              </p>
              <div>
                <h3 className="text-xs font-semibold text-foreground">
                  Classes ({preview.model.nodes.length})
                </h3>
                <ul className="mt-1 flex flex-col gap-1">
                  {preview.model.nodes.map((node) => (
                    <li key={node.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {nodeLabel(preview.model, node.id)}
                        <span className="ml-2 text-xs text-muted-foreground">{node.type}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatConfidence(preview.confidence[node.id])}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-foreground">
                  Relationships ({preview.model.edges.length})
                </h3>
                <ul className="mt-1 flex flex-col gap-1">
                  {preview.model.edges.map((edge) => (
                    <li key={edge.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {nodeLabel(preview.model, edge.source)} →{" "}
                        {nodeLabel(preview.model, edge.target)}
                        <span className="ml-2 text-xs text-muted-foreground">{edge.type}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatConfidence(preview.confidence[edge.id])}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        )}

        <DialogFooter className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          {phase === "preview" ? (
            <Button type="button" variant="default" onClick={handleConfirm} disabled={busy}>
              Confirm import
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {phase === "uploading" ? "Analyzing…" : "Choose photo"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
