import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { importXmiDiagram } from "@umlstudio/core";
import { toast } from "react-toastify";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { log } from "@/logger";

export function useImportDiagramFile() {
  const createModel = usePersistenceModelStore((state) => state.createModel);
  const navigate = useNavigate();

  return useCallback(
    async (file: File) => {
      try {
        const isXmi =
          file.name.toLowerCase().endsWith(".xmi") ||
          file.name.toLowerCase().endsWith(".xml") ||
          file.type.includes("xml");

        if (!isXmi) {
          throw new Error("Only Enterprise Architect XMI (.xmi) diagrams are supported");
        }

        const text = await file.text();
        const model = importXmiDiagram(text, {
          defaultTitle: file.name.replace(/\.[^/.]+$/, ""),
        });

        if (!model?.id) throw new Error("Imported diagram has no id");

        createModel(model);
        await navigate({
          to: "/local/$id",
          params: { id: model.id },
          replace: true,
        });
        toast.success(`Imported "${model.title || "Untitled diagram"}".`);
      } catch (error) {
        log.error("Failed to import diagram file", error as Error);
        toast.error(
          `Couldn't import "${file.name}" — only Enterprise Architect XMI (.xmi) files are supported.`,
        );
      }
    },
    [createModel, navigate],
  );
}
