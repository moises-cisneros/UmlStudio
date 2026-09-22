import { useEffect, useState } from "react"
import { InfoIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip"
import { useNavigate } from "@tanstack/react-router"
import { useModalContext } from "@/contexts"
import { useModalProgress } from "@/contexts/ModalProgressContext"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { sharedDiagramRoute } from "@/utils/sharedDiagramLinks"
import { toast } from "react-toastify"
import {
  HomeDialogActions,
  HomeDialogContent,
  HomeDialogField,
  HomeDialogNotice,
  HomeDialogTextInput,
} from "./HomeDialog"
import { ShareLinkRow, MODE_OPTIONS } from "./ShareLinkRow"
import { useShareableDiagram } from "./useShareableDiagram"
import { useTranslation } from "@/i18n"

type ShareDashboardModalProps = {
  modelId?: string
}

export const ShareDashboardModal = ({ modelId }: ShareDashboardModalProps) => {
  const { t } = useTranslation()
  const { closeModal } = useModalContext()
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)

  const persistedModel = usePersistenceModelStore((state) =>
    modelId ? state.models[modelId] : null
  )
  const modelData = persistedModel?.model ?? null
  const [name, setName] = useState(persistedModel?.model?.title?.trim() || "Untitled Diagram")

  const share = useShareableDiagram(modelData)

  const { setLoading } = useModalProgress()
  useEffect(() => setLoading(share.isCreating), [share.isCreating, setLoading])

  const openShared = () => {
    if (!share.diagramId) return
    if (!authUser) {
      toast.error(t.auth?.authRequiredShared ?? "Authentication required to collaborate")
      return
    }
    closeModal()
    navigate(sharedDiagramRoute(share.diagramId, share.mode))
  }

  return (
    <HomeDialogContent>
      <HomeDialogNotice>
        {share.diagramId ? t.share.noticeDashboardShare : t.share.noticeDashboardCreate}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className="ml-1 inline-flex cursor-help items-center" />
              }
              aria-label="More information"
            >
              <InfoIcon className="size-4 text-(--home-accent-base)" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>
              {share.diagramId ? (
                <span style={{ display: "block", lineHeight: "1.6" }}>
                  • <b>Editor</b> — real-time multi-user editing
                  <br />• <b>Lector</b> — read-only live viewing
                </span>
              ) : (
                <span>
                  A snapshot is uploaded to our servers — your local diagram is untouched. Links
                  stay active for 120 days, and the clock resets whenever the diagram is opened or
                  edited.
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </HomeDialogNotice>

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
      )}

      <HomeDialogActions
        cancelLabel={share.diagramId ? t.common.close : t.common.cancel}
        confirmLabel={share.diagramId ? t.share.openDiagram : t.share.createLink}
        loadingLabel={t.share.creating}
        loading={share.isCreating}
        confirmDisabled={!share.diagramId && !name.trim()}
        onCancel={closeModal}
        onConfirm={() => (share.diagramId ? openShared() : void share.create(name))}
      />
    </HomeDialogContent>
  )
}
