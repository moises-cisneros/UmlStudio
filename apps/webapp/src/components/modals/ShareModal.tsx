import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Users, Radio, ArrowRight } from "lucide-react"
import { useEditorContext, useModalContext } from "@/contexts"
import { useModalProgress } from "@/contexts/ModalProgressContext"
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore"
import { useAuthStore } from "@/stores/useAuthStore"
import { sharedDiagramRoute } from "@/utils/sharedDiagramLinks"
import { useSharedDiagramId } from "@/hooks/useSharedDiagramId"
import { Button } from "@umlstudio/ui/components/button"
import { toast } from "react-toastify"
import { ShareLinkRow, MODE_OPTIONS } from "./ShareLinkRow"
import { useShareableDiagram } from "./useShareableDiagram"
import { useTranslation } from "@/i18n"

export const ShareModal = () => {
  const { t } = useTranslation()
  const { editor } = useEditorContext()
  const { closeModal } = useModalContext()
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)

  const modelData = editor?.model ?? null
  const sharedId = useSharedDiagramId()
  const share = useShareableDiagram(modelData, sharedId)

  const [name, setName] = useState(() => editor?.model?.title?.trim() || "Untitled Diagram")
  const hasLocalOriginal = Boolean(usePersistenceModelStore.getState().currentModelId)

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
    <div
      data-testid="share-modal-content"
      className="flex flex-col gap-5 p-6 bg-(--umlstudio-surface,#151d2e) text-(--umlstudio-foreground,#f8fafc)"
    >
      {/* Precision Technical Header */}
      <div className="flex flex-col gap-2 border-b border-(--umlstudio-border,#243046) pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-(--periwinkle,#c2bbf0)/15 text-(--periwinkle,#c2bbf0) border border-(--periwinkle,#c2bbf0)/30">
              {t.share.collabStereotype}
            </span>
            {share.diagramId && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(--color-success,#10b981)">
                <span className="size-2 rounded-full bg-(--color-success,#10b981) animate-pulse" />
                {t.share.liveSessionBadge}
              </span>
            )}
          </div>
          <Users className="size-4 text-(--dodger-blue,#3590f3)" />
        </div>
        <p className="text-xs text-(--umlstudio-text-muted,#94a3b8) leading-relaxed">
          {t.share.subtitle}
        </p>
      </div>

      {/* Mode A: Not Yet Shared - Initial Creation Form */}
      {!share.diagramId ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-(--umlstudio-border,#243046) bg-(--umlstudio-surface-sunken,#0c101a) p-3 flex items-start gap-3">
            <Radio className="size-4 text-(--dodger-blue,#3590f3) shrink-0 mt-0.5 animate-pulse" />
            <div className="text-xs leading-relaxed text-(--umlstudio-text-muted,#94a3b8)">
              {t.share.noticeLocal}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="share-diagram-name"
              className="text-xs font-semibold text-(--umlstudio-foreground,#f8fafc)"
            >
              {t.share.nameLabel}
            </label>
            <input
              id="share-diagram-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={share.isCreating}
              placeholder={t.share.namePlaceholder}
              className="h-10 rounded-lg border border-(--umlstudio-border,#243046) bg-(--umlstudio-surface-sunken,#0c101a) px-3 text-sm text-(--umlstudio-foreground,#f8fafc) placeholder:text-(--umlstudio-text-muted,#94a3b8) focus:border-(--dodger-blue,#3590f3) focus:ring-1 focus:ring-(--dodger-blue,#3590f3) outline-none transition-all disabled:opacity-50"
            />
          </div>
        </div>
      ) : (
        /* Mode B: Shared - Real-Time Collaboration Link & Actions */
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-(--umlstudio-foreground,#f8fafc)">
              {t.share.anyoneWithLink}
            </span>
            <ShareLinkRow
              link={share.link}
              copied={share.copied}
              onCopy={() => void share.copy()}
              mode={share.mode}
              options={MODE_OPTIONS}
              onSelectMode={share.selectMode}
            />
          </div>

          {hasLocalOriginal && (
            <p className="text-xs text-(--umlstudio-text-muted,#94a3b8) italic">
              {t.share.localCopyNotice}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-(--umlstudio-border,#243046)">
        <Button
          type="button"
          variant="outline"
          onClick={closeModal}
          disabled={share.isCreating}
          className="border-(--umlstudio-border,#243046) text-(--umlstudio-foreground,#f8fafc) hover:bg-(--umlstudio-surface-hover,#1e293f) hover:text-white"
        >
          {share.diagramId ? t.common.close : t.common.cancel}
        </Button>

        {!share.diagramId ? (
          <Button
            type="button"
            onClick={() => void share.create(name)}
            disabled={share.isCreating || !name.trim()}
            className="bg-(--dodger-blue,#3590f3) hover:bg-(--deep-sky-blue,#62bfed) text-white font-medium shadow-sm transition-all"
          >
            {share.isCreating ? (
              <span className="flex items-center gap-2">
                <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.share.creating}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Users className="size-4" />
                {t.share.createLink}
              </span>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={openShared}
            className="bg-(--dodger-blue,#3590f3) hover:bg-(--deep-sky-blue,#62bfed) text-white font-medium shadow-sm transition-all"
          >
            <span className="flex items-center gap-2">
              <Users className="size-4" />
              {t.share.joinSession}
              <ArrowRight className="size-4" />
            </span>
          </Button>
        )}
      </div>
    </div>
  )
}
