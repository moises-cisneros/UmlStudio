import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEditorContext, useModalContext } from "@/contexts";
import { useModalProgress } from "@/contexts/ModalProgressContext";
import { DiagramView } from "@/types";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { randomCollabName } from "@umlstudio/core";
import { sharedDiagramRoute } from "@/utils/sharedDiagramLinks";
import { useSharedDiagramId } from "@/hooks/useSharedDiagramId";
import {
  HomeDialogActions,
  HomeDialogContent,
  HomeDialogField,
  HomeDialogNotice,
  HomeDialogTextInput,
} from "./HomeDialog";
import { ShareLinkRow, MODE_OPTIONS } from "./ShareLinkRow";
import { useShareableDiagram } from "./useShareableDiagram";
import { EmbedSnippetPanel } from "./EmbedSnippetPanel";
import { useTranslation } from "@/i18n";

export const ShareModal = () => {
  const { t } = useTranslation();
  const { editor } = useEditorContext();
  const { closeModal, openModal } = useModalContext();
  const navigate = useNavigate();

  const modelData = editor?.model ?? null;
  const sharedId = useSharedDiagramId();
  const share = useShareableDiagram(modelData, sharedId);

  const [name, setName] = useState(
    () => editor?.model?.title?.trim() || "Untitled Diagram",
  );
  const [collaborateName, setCollaborateName] = useState(
    () => sessionStorage.getItem("umlstudio-collab-name") || "",
  );
  const hasLocalOriginal = Boolean(
    usePersistenceModelStore.getState().currentModelId,
  );

  const { setLoading } = useModalProgress();
  useEffect(() => setLoading(share.isCreating), [share.isCreating, setLoading]);

  const openShared = () => {
    if (!share.diagramId) return;
    if (share.mode === DiagramView.COLLABORATE) {
      const id = share.diagramId;
      openModal("COLLABORATE_NAME", {
        initialName: collaborateName.trim() || randomCollabName(),
        onConfirm: (chosen: string) => {
          sessionStorage.setItem("umlstudio-collab-name", chosen);
          setCollaborateName(chosen);
          closeModal();
          navigate(sharedDiagramRoute(id, share.mode));
        },
      });
      return;
    }
    closeModal();
    navigate(sharedDiagramRoute(share.diagramId, share.mode));
  };

  return (
    <HomeDialogContent testId="share-modal-content">
      {!share.diagramId && (
        <HomeDialogNotice>{t.share.noticeLocal}</HomeDialogNotice>
      )}

      {!share.diagramId && (
        <HomeDialogField label={t.share.nameLabel} htmlFor="share-diagram-name">
          <HomeDialogTextInput
            id="share-diagram-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            disabled={share.isCreating}
            placeholder={t.share.namePlaceholder}
          />
        </HomeDialogField>
      )}

      {share.diagramId && (
        <>
          <HomeDialogField label={t.share.anyoneWithLink}>
            <ShareLinkRow
              link={share.link}
              copied={share.copied}
              onCopy={() => void share.copy()}
              mode={share.mode}
              options={MODE_OPTIONS}
              onSelectMode={share.selectMode}
            />
          </HomeDialogField>

          {hasLocalOriginal && (
            <p className="text-xs text-[var(--home-text-secondary)]">
              {t.share.localCopyNotice}
            </p>
          )}

          <EmbedSnippetPanel diagramId={share.diagramId} title={name} />
        </>
      )}

      <HomeDialogActions
        cancelLabel={share.diagramId ? t.common.close : t.common.cancel}
        confirmLabel={
          share.diagramId ? t.share.openDiagram : t.share.createLink
        }
        loadingLabel={t.share.creating}
        loading={share.isCreating}
        confirmDisabled={!share.diagramId && !name.trim()}
        onCancel={closeModal}
        onConfirm={() =>
          share.diagramId ? openShared() : void share.create(name)
        }
      />
    </HomeDialogContent>
  );
};
