import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { importDiagram, importXmiDiagram, type UMLModel } from "@umlstudio/core";
import { toast } from "react-toastify";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { log } from "@/logger";

export function useImportDiagramFile() {
  const createModel = usePersistenceModelStore((state) => state.createModel);
  const navigate = useNavigate();

  return useCallback(
    async (file: File) => {
      try {
        const lowerName = file.name.toLowerCase();
        const isJson = lowerName.endsWith(".json") || file.type.includes("json");
        const isXmi =
          lowerName.endsWith(".xmi") ||
          lowerName.endsWith(".xml") ||
          file.type.includes("xml");

        if (!isJson && !isXmi) {
          throw new Error(
            "Only UmlStudio JSON (.json) and Enterprise Architect XMI (.xmi, .xml) files are supported.",
          );
        }

        const text = await file.text();
        let model: UMLModel;

        if (isJson) {
          const parsed = JSON.parse(text);
          model = importDiagram(parsed) as UMLModel;
          if (!model.title) {
            model.title = file.name.replace(/\.[^/.]+$/, "");
          }
        } else {
          model = importXmiDiagram(text, {
            defaultTitle: file.name.replace(/\.[^/.]+$/, ""),
          });
        }

        // Asignación formal de UUID para garantizar identidad canónica y evitar colisiones o IDs basados en nombres
        const newDiagramId = crypto.randomUUID();
        model.id = newDiagramId;

        createModel(model);
        await navigate({
          to: "/local/$id",
          params: { id: newDiagramId },
          replace: true,
        });
        toast.success(`Imported "${model.title || "Untitled diagram"}".`);
      } catch (error) {
        log.error("Failed to import diagram file", error as Error);
        toast.error(
          `Couldn't import "${file.name}" — only UmlStudio JSON (.json) and Enterprise Architect XMI (.xmi) files are supported.`,
        );
      }
    },
    [createModel, navigate],
  );
}
