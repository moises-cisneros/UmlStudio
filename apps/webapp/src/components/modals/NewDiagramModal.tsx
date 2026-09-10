import { useState } from "react";
import { useModalContext } from "@/contexts/ModalContext";
import { UMLDiagramType } from "@umlstudio/core";
import { useNavigate } from "@tanstack/react-router";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { getDiagramTypeIcon } from "@/components/home/diagramTypeMeta";
import { TemplateThumbnail } from "./TemplateThumbnail";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@umlstudio/ui/components/tabs";
import { log } from "@/logger";
import { prepareTemplateModel } from "@/utils/templateModels";
import {
  HomeDialogActions,
  HomeDialogContent,
  HomeDialogField,
  HomeDialogNotice,
  type HomeDialogOption,
  HomeDialogOptionGroup,
  HomeDialogTextInput,
} from "./HomeDialog";

const diagramTypes = {
  structural: [UMLDiagramType.ClassDiagram],
  behavioral: [] as UMLDiagramType[],
};

const diagramTypeToTitle: Record<UMLDiagramType, string> = {
  ClassDiagram: "Class Diagram",
};

const toDiagramOption = (
  type: UMLDiagramType,
): HomeDialogOption<UMLDiagramType> => ({
  value: type,
  label: diagramTypeToTitle[type],
  icon: getDiagramTypeIcon(type, "h-7 w-7"),
});

const structuralDiagramOptions: HomeDialogOption<UMLDiagramType>[] =
  diagramTypes.structural.map(toDiagramOption);

enum TemplateType {
  Adapter = "Adapter",
  Bridge = "Bridge",
  Command = "Command",
  Observer = "Observer",
  Factory = "Factory",
}

const toTemplateOption = (
  template: TemplateType,
): HomeDialogOption<TemplateType> => ({
  value: template,
  label: template,
  icon: <TemplateThumbnail name={template} />,
});

const structuralTemplates: HomeDialogOption<TemplateType>[] = [
  TemplateType.Adapter,
  TemplateType.Bridge,
].map(toTemplateOption);

const behavioralTemplates: HomeDialogOption<TemplateType>[] = [
  TemplateType.Command,
  TemplateType.Observer,
].map(toTemplateOption);

const creationalTemplates: HomeDialogOption<TemplateType>[] = [
  TemplateType.Factory,
].map(toTemplateOption);

export const NewDiagramModal = () => {
  const { closeModal } = useModalContext();
  const [activeTab, setActiveTab] = useState<"scratch" | "template">("scratch");
  const [selectedDiagramType, setSelectedDiagramType] =
    useState<UMLDiagramType>(UMLDiagramType.ClassDiagram);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(
    TemplateType.Adapter,
  );
  const [isDiagramNameDefault, setIsDiagramNameDefault] =
    useState<boolean>(true);
  const [newDiagramTitle, setNewDiagramTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const createModelByTitleAndType = usePersistenceModelStore(
    (state) => state.createModelByTitleAndType,
  );
  const createModel = usePersistenceModelStore((state) => state.createModel);

  const handleCreateDiagram = () => {
    const newId = createModelByTitleAndType(
      newDiagramTitle,
      selectedDiagramType,
    );
    closeModal();
    navigate({ to: "/local/$id", params: { id: newId } });
  };

  const handleDiagramNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setNewDiagramTitle(event.target.value);
    setIsDiagramNameDefault(false);
  };

  const handleTabChange = (tab: "scratch" | "template") => {
    setActiveTab(tab);
    if (isDiagramNameDefault) {
      setNewDiagramTitle(tab === "template" ? selectedTemplate : "");
    }
  };

  const handleDiagramTypeChange = (type: UMLDiagramType) => {
    setSelectedDiagramType(type);
  };

  const handleTemplateChange = (template: TemplateType) => {
    setSelectedTemplate(template);
    if (isDiagramNameDefault) {
      setNewDiagramTitle(template);
    }
  };

  const handleCreateFromTemplate = async () => {
    setError(null);

    try {
      const jsonModule = await import(
        `assets/diagramTemplates/${selectedTemplate}.json`
      );
      const jsonData = jsonModule.default;

      if (!jsonData) {
        throw new Error("Selected template data not found");
      }

      const templateModel = prepareTemplateModel(jsonData, {
        id: crypto.randomUUID(),
        title: newDiagramTitle,
      });

      createModel(templateModel);
      closeModal();
      navigate({ to: "/local/$id", params: { id: templateModel.id } });
    } catch (err: unknown) {
      log.error("Error creating diagram from template:", err as Error);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    }
  };

  return (
    <HomeDialogContent>
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          handleTabChange(value as "scratch" | "template")
        }
      >
        <TabsList>
          <TabsTrigger value="scratch">Blank diagram</TabsTrigger>
          <TabsTrigger value="template">Use template</TabsTrigger>
        </TabsList>

        {error && <HomeDialogNotice>{error}</HomeDialogNotice>}

        <HomeDialogField label="Name" htmlFor="diagram-title">
          <HomeDialogTextInput
            id="diagram-title"
            value={newDiagramTitle}
            onChange={handleDiagramNameChange}
            placeholder="Enter diagram name"
          />
        </HomeDialogField>

        <TabsContent value="scratch" className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-foreground">
                Structural Diagrams
              </h3>
              <HomeDialogOptionGroup
                label="Structural Diagrams"
                options={structuralDiagramOptions}
                value={selectedDiagramType}
                onChange={handleDiagramTypeChange}
                onConfirm={handleCreateDiagram}
                hideLabel
              />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="template" className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">
              Structural
            </h3>
            <HomeDialogOptionGroup
              label="Structural"
              options={structuralTemplates}
              value={selectedTemplate}
              onChange={handleTemplateChange}
              onConfirm={() => void handleCreateFromTemplate()}
              columns={2}
              hideLabel
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">
              Behavioral
            </h3>
            <HomeDialogOptionGroup
              label="Behavioral"
              options={behavioralTemplates}
              value={selectedTemplate}
              onChange={handleTemplateChange}
              onConfirm={() => void handleCreateFromTemplate()}
              columns={2}
              hideLabel
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">
              Creational
            </h3>
            <HomeDialogOptionGroup
              label="Creational"
              options={creationalTemplates}
              value={selectedTemplate}
              onChange={handleTemplateChange}
              onConfirm={() => void handleCreateFromTemplate()}
              columns={2}
              hideLabel
            />
          </section>
        </TabsContent>
      </Tabs>

      <HomeDialogActions
        cancelLabel="Cancel"
        confirmLabel="Create Diagram"
        onCancel={closeModal}
        onConfirm={() => {
          if (activeTab === "scratch") {
            handleCreateDiagram();
            return;
          }

          void handleCreateFromTemplate();
        }}
      />
    </HomeDialogContent>
  );
};
