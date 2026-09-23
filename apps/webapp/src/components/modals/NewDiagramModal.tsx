import { useState, type ChangeEvent, type KeyboardEvent } from "react"
import { useModalContext } from "@/contexts/ModalContext"
import { UMLDiagramType } from "@umlstudio/core"
import { useNavigate } from "@tanstack/react-router"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { useTranslation } from "@/i18n"
import {
  HomeDialogActions,
  HomeDialogContent,
  HomeDialogField,
  HomeDialogTextInput,
} from "./HomeDialog"

export const NewDiagramModal = () => {
  const { closeModal } = useModalContext()
  const { t } = useTranslation()
  const [newDiagramTitle, setNewDiagramTitle] = useState<string>("")
  const navigate = useNavigate()

  const createModelByTitleAndType = usePersistenceModelStore(
    (state) => state.createModelByTitleAndType
  )

  const handleCreateDiagram = () => {
    if (useAuthStore.getState().status !== "authenticated") {
      closeModal()
      navigate({ to: "/login", search: { redirect: "/" } })
      return
    }
    const newId = createModelByTitleAndType(newDiagramTitle, UMLDiagramType.ClassDiagram)
    closeModal()
    navigate({ to: "/local/$id", params: { id: newId } })
  }

  const handleDiagramNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewDiagramTitle(event.target.value)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleCreateDiagram()
    }
  }

  return (
    <HomeDialogContent>
      <div className="mt-4 flex flex-col gap-4">
        <HomeDialogField label={t.newDiagram.nameLabel} htmlFor="scratch-diagram-title">
          <HomeDialogTextInput
            id="scratch-diagram-title"
            value={newDiagramTitle}
            onChange={handleDiagramNameChange}
            onKeyDown={handleInputKeyDown}
            placeholder={t.newDiagram.namePlaceholder}
            autoFocus
          />
        </HomeDialogField>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t.newDiagram.scratchHint}
        </p>
      </div>

      <HomeDialogActions
        cancelLabel={t.newDiagram.cancel}
        confirmLabel={t.newDiagram.create}
        onCancel={closeModal}
        onConfirm={handleCreateDiagram}
      />
    </HomeDialogContent>
  )
}
