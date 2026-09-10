import React, { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { type UMLDiagramType } from "@umlstudio/core";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { useModalContext } from "@/contexts";
import { useImportDiagramFile } from "@/hooks/useImportDiagramFile";
import { DiagramGallerySkeleton } from "@/components/home/DiagramGallerySkeleton";
import { HomeWorkbenchHeader } from "@/components/home/HomeWorkbenchHeader";
import { QuickStartTemplates } from "@/components/home/QuickStartTemplates";
import { PageShell } from "@/components/PageShell";
import { useHomeChrome } from "@/components/home/useHomeChrome";
import { getDiagramTypeLabel } from "@/components/home/diagramTypeMeta";
import { pruneExpiredSharedDiagrams } from "@/utils/sharedDiagramStorage";
import { readHighlightSharedDiagramId } from "@/lib/navProvenance";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTranslation } from "@/i18n";

const DiagramGallery = lazy(() =>
  import("@/components/home/DiagramGallery").then((module) => ({
    default: module.DiagramGallery,
  })),
);

export const HomePage = () => {
  const { t } = useTranslation();
  useDocumentTitle(t.dashboard.title);
  const location = useLocation();
  const highlightSharedDiagramId =
    readHighlightSharedDiagramId(location.state) ?? null;
  const { openModal } = useModalContext();
  const setCurrentModelId = usePersistenceModelStore(
    (state) => state.setCurrentModelId,
  );
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const importFile = useImportDiagramFile();

  const chrome = useHomeChrome();

  const openNewDiagram = () =>
    openModal("NEW_DIAGRAM", { dialogVariant: "home" });
  const triggerJsonImport = () => jsonImportRef.current?.click();

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importFile(file);
    e.target.value = "";
  };

  useEffect(() => {
    setCurrentModelId(null);
  }, [setCurrentModelId]);

  useEffect(() => {
    pruneExpiredSharedDiagrams();
  }, []);

  const [count, setCount] = React.useState(0);
  const [presentTypes, setPresentTypes] = React.useState<
    readonly UMLDiagramType[]
  >([]);
  const typeOptions = useMemo(
    () =>
      [...presentTypes].sort((firstType, secondType) =>
        getDiagramTypeLabel(firstType).localeCompare(
          getDiagramTypeLabel(secondType),
        ),
      ),
    [presentTypes],
  );

  return (
    <PageShell
      mainClassName="pb-[max(4rem,calc(var(--safe-area-inset-bottom,0px)+2.5rem))] md:pb-[max(2.5rem,var(--safe-area-inset-bottom,0px))]"
      header={
        <HomeWorkbenchHeader
          chrome={chrome}
          count={count}
          typeOptions={typeOptions}
          onNewDiagram={openNewDiagram}
          onImportJson={triggerJsonImport}
        />
      }
    >
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json,application/json,.xmi,.xml,application/xml,text/xml"
        className="sr-only"
        onChange={handleJsonImport}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="mt-6 px-4 md:px-0">
        <QuickStartTemplates onNewDiagram={openNewDiagram} />

        <div className="my-8">
          <hr className="border-border-subtle" />
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-black tracking-tight text-(--home-text-primary)">
            {t.dashboard.title}
          </h2>
        </div>

        <Suspense fallback={<DiagramGallerySkeleton />}>
          <DiagramGallery
            chrome={chrome}
            highlightSharedDiagramId={highlightSharedDiagramId}
            onCountChange={setCount}
            onTypeOptionsChange={setPresentTypes}
          />
        </Suspense>
      </div>
    </PageShell>
  );
};
