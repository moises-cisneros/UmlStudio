import { useState, type ChangeEvent, type KeyboardEvent } from "react"
import { useModalContext } from "@/contexts/ModalContext"
import { UMLDiagramType } from "@umlstudio/core"
import { useNavigate } from "@tanstack/react-router"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { Tabs, TabsContent } from "@umlstudio/ui/components/tabs"
import { log } from "@/logger"
import { prepareTemplateModel } from "@/utils/templateModels"
import { useTranslation } from "@/i18n"
import { cn } from "@umlstudio/ui/lib/utils"
import { TemplateThumbnail } from "./TemplateThumbnail"
import {
  HomeDialogActions,
  HomeDialogContent,
  HomeDialogField,
  HomeDialogNotice,
  HomeDialogTextInput,
} from "./HomeDialog"

enum TemplateType {
  Adapter = "Adapter",
  Bridge = "Bridge",
  Command = "Command",
  Observer = "Observer",
  Factory = "Factory",
}

interface TemplateMeta {
  id: TemplateType
  titleKey: "adapter" | "bridge" | "command" | "factory" | "observer"
  descKey: "adapterDesc" | "bridgeDesc" | "commandDesc" | "factoryDesc" | "observerDesc"
  badgeKey: "gofStructural" | "gofBehavioral" | "gofCreational"
  category: "structural" | "behavioral" | "creational"
}

const TEMPLATE_METAS: TemplateMeta[] = [
  {
    id: TemplateType.Adapter,
    titleKey: "adapter",
    descKey: "adapterDesc",
    badgeKey: "gofStructural",
    category: "structural",
  },
  {
    id: TemplateType.Bridge,
    titleKey: "bridge",
    descKey: "bridgeDesc",
    badgeKey: "gofStructural",
    category: "structural",
  },
  {
    id: TemplateType.Command,
    titleKey: "command",
    descKey: "commandDesc",
    badgeKey: "gofBehavioral",
    category: "behavioral",
  },
  {
    id: TemplateType.Observer,
    titleKey: "observer",
    descKey: "observerDesc",
    badgeKey: "gofBehavioral",
    category: "behavioral",
  },
  {
    id: TemplateType.Factory,
    titleKey: "factory",
    descKey: "factoryDesc",
    badgeKey: "gofCreational",
    category: "creational",
  },
]

export const NewDiagramModal = () => {
  const { closeModal } = useModalContext()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<"scratch" | "template">("scratch")
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(TemplateType.Adapter)
  const [isDiagramNameDefault, setIsDiagramNameDefault] = useState<boolean>(true)
  const [newDiagramTitle, setNewDiagramTitle] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const createModelByTitleAndType = usePersistenceModelStore(
    (state) => state.createModelByTitleAndType
  )
  const createModel = usePersistenceModelStore((state) => state.createModel)

  const getTemplateTitle = (type: TemplateType) => {
    const meta = TEMPLATE_METAS.find((m) => m.id === type)
    return meta ? t.templates[meta.titleKey] : type
  }

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
    setIsDiagramNameDefault(false)
  }

  const handleTabChange = (tab: "scratch" | "template") => {
    setActiveTab(tab)
    if (isDiagramNameDefault) {
      setNewDiagramTitle(tab === "template" ? getTemplateTitle(selectedTemplate) : "")
    }
  }

  const handleTemplateSelect = (template: TemplateType) => {
    setSelectedTemplate(template)
    if (isDiagramNameDefault) {
      setNewDiagramTitle(getTemplateTitle(template))
    }
  }

  const handleCreateFromTemplate = async () => {
    if (useAuthStore.getState().status !== "authenticated") {
      closeModal()
      navigate({ to: "/login", search: { redirect: "/" } })
      return
    }
    setError(null)

    try {
      const jsonModule = await import(`assets/diagramTemplates/${selectedTemplate}.json`)
      const jsonData = jsonModule.default

      if (!jsonData) {
        throw new Error(t.newDiagram.errorTemplateNotFound)
      }

      const templateModel = prepareTemplateModel(jsonData, {
        id: crypto.randomUUID(),
        title: newDiagramTitle || getTemplateTitle(selectedTemplate),
      })

      createModel(templateModel)
      closeModal()
      navigate({ to: "/local/$id", params: { id: templateModel.id } })
    } catch (err: unknown) {
      log.error("Error creating diagram from template:", err as Error)

      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t.newDiagram.errorUnexpected)
      }
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      if (activeTab === "scratch") {
        handleCreateDiagram()
      } else {
        void handleCreateFromTemplate()
      }
    }
  }

  return (
    <HomeDialogContent>
      <Tabs
        value={activeTab}
        onValueChange={(value) => handleTabChange(value as "scratch" | "template")}
      >
        {error && <HomeDialogNotice>{error}</HomeDialogNotice>}

        {/* Scratch Tab: Only Diagram Name field per user requirement */}
        <TabsContent value="scratch" className="mt-4 flex flex-col gap-4">
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
        </TabsContent>

        {/* Template Tab: Name field + stylized template card selection */}
        <TabsContent value="template" className="mt-4 flex flex-col gap-4">
          <HomeDialogField label={t.newDiagram.nameLabel} htmlFor="template-diagram-title">
            <HomeDialogTextInput
              id="template-diagram-title"
              value={newDiagramTitle}
              onChange={handleDiagramNameChange}
              onKeyDown={handleInputKeyDown}
              placeholder={t.newDiagram.namePlaceholder}
            />
          </HomeDialogField>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-foreground">
              {t.dashboard.quickStartTitle}
            </span>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-h-80 overflow-y-auto pr-1">
              {TEMPLATE_METAS.map((item) => {
                const isSelected = selectedTemplate === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTemplateSelect(item.id)}
                    onDoubleClick={() => void handleCreateFromTemplate()}
                    className={cn(
                      "group flex flex-col items-start overflow-hidden rounded-xl border p-2 text-left transition-all duration-150 cursor-pointer",
                      isSelected
                        ? "border-(--dodger-blue) bg-(--dodger-blue)/8 ring-1 ring-(--dodger-blue)/50 shadow-xs"
                        : "border-border/70 bg-card hover:border-border hover:bg-accent/40"
                    )}
                  >
                    <div className="relative h-20 w-full overflow-hidden rounded-lg border border-border/50 bg-(--home-surface-raised) mb-2">
                      <div className="size-full p-1.5 transition-transform duration-200 group-hover:scale-105">
                        <TemplateThumbnail name={item.id} />
                      </div>
                      <span className="absolute right-1.5 top-1.5 rounded bg-[rgba(0,0,0,0.55)] px-1.5 py-0.5 text-[9px] font-semibold text-(--periwinkle) backdrop-blur-xs border border-white/5">
                        {t.templates[item.badgeKey]}
                      </span>
                    </div>

                    <div className="w-full">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {t.templates[item.titleKey]}
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                        {t.templates[item.descKey]}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <HomeDialogActions
        cancelLabel={t.newDiagram.cancel}
        confirmLabel={
          activeTab === "scratch" ? t.newDiagram.create : t.newDiagram.createFromTemplate
        }
        onCancel={closeModal}
        onConfirm={() => {
          if (activeTab === "scratch") {
            handleCreateDiagram()
            return
          }

          void handleCreateFromTemplate()
        }}
      />
    </HomeDialogContent>
  )
}
