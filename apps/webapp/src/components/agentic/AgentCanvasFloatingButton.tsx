import { type FC } from "react"
import { createPortal } from "react-dom"
import { SparklesIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@umlstudio/ui/components/tooltip"
import { useEditorContext } from "@/contexts"
import { useRegionHost } from "@/hooks/useRegionHost"
import { useWorkbenchStore } from "@/stores/useWorkbenchStore"
import { useTranslation } from "@/i18n"

export const AgentCanvasFloatingButton: FC = () => {
  const { editor } = useEditorContext()
  const { isAgentDockOpen, toggleAgentDock } = useWorkbenchStore()
  const { t } = useTranslation()

  // Montar en la región inferior derecha del lienzo cuando el dock esté cerrado
  const bottomRightHost = useRegionHost(editor, "bottom-right", !isAgentDockOpen)

  if (!bottomRightHost || isAgentDockOpen) return null

  return createPortal(
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={toggleAgentDock}
            aria-label={`${t.agent.triggerButton} (Ctrl+J)`}
            className="group relative inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-xs font-semibold text-white transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer select-none bg-linear-to-r from-[#2563eb] via-[#3590f3] to-[#0ea5e9] border border-white/30 shadow-[0_8px_24px_-4px_rgba(37,99,235,0.55)] hover:shadow-[0_12px_32px_rgba(53,144,243,0.75)] pointer-events-auto"
          >
            {/* Anillo de resplandor / Aura animada pulsante para que resalte en el lienzo */}
            <span
              className="absolute -inset-0.5 rounded-full bg-linear-to-r from-(--umlstudio-primary) via-[#6366f1] to-(--deep-sky-blue) opacity-70 blur-md transition-all duration-300 group-hover:opacity-100 group-hover:blur-lg animate-pulse -z-10"
              aria-hidden="true"
            />
            <div className="flex size-5 items-center justify-center rounded-full bg-white/20 shadow-inner">
              <SparklesIcon className="size-3.5 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </div>
            <span className="tracking-wide drop-shadow-xs">{t.agent.triggerButton}</span>
            <kbd className="hidden sm:inline-flex items-center rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-white/90 border border-white/20">
              Ctrl+J
            </kbd>
          </button>
        }
      />
      <TooltipContent side="top" align="end">
        {`${t.agent.title} (Ctrl+J)`}
      </TooltipContent>
    </Tooltip>,
    bottomRightHost
  )
}
