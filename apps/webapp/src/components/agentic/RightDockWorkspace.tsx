import { type FC } from "react"
import { SparklesIcon, ListTreeIcon, MessagesSquareIcon, XIcon } from "lucide-react"
import { useWorkbenchStore } from "@/stores/useWorkbenchStore"
import { useTranslation } from "@/i18n"
import { useSharedDiagramId } from "@/hooks/useSharedDiagramId"
import { RoomChatPanelContainer } from "@/components/roomai/RoomChatPanelContainer"
import { AgentChatStream } from "./AgentChatStream"
import { ClassInspectorTab } from "./ClassInspectorTab"

export const RightDockWorkspace: FC = () => {
  const { isAgentDockOpen, activeDockTab, setActiveDockTab, toggleAgentDock } = useWorkbenchStore()
  const { t } = useTranslation()
  const sharedDiagramId = useSharedDiagramId()

  if (!isAgentDockOpen) return null

  return (
    <aside
      className="workbench-right-dock animate-in fade-in slide-in-from-right-4 duration-200"
      role="complementary"
      aria-label={`${t.agent.title} & ${t.agent.inspectorTitle}`}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onTouchStartCapture={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      {/* PESTAÑAS DEL DOCK */}
      <div className="workbench-dock-tabs">
        <button
          type="button"
          className="workbench-dock-tab"
          data-active={activeDockTab === "agent"}
          onClick={() => setActiveDockTab("agent")}
        >
          <SparklesIcon className="size-3.5 text-(--umlstudio-primary)" />
          <span>{t.agent.tabAgent}</span>
        </button>

        <button
          type="button"
          className="workbench-dock-tab"
          data-active={activeDockTab === "inspector"}
          onClick={() => setActiveDockTab("inspector")}
        >
          <ListTreeIcon className="size-3.5" />
          <span>{t.agent.tabInspector}</span>
        </button>

        {sharedDiagramId && (
          <button
            type="button"
            className="workbench-dock-tab"
            data-active={activeDockTab === "room"}
            onClick={() => setActiveDockTab("room")}
          >
            <MessagesSquareIcon className="size-3.5" />
            <span>{t.roomAi.tabRoom}</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleAgentDock}
          aria-label={t.common.close}
          className="flex items-center justify-center px-3 text-secondary-foreground transition-colors hover:text-(--home-text-primary)"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* CONTENIDO DE LA PESTAÑA ACTIVA */}
      <div className="workbench-dock-body">
        {activeDockTab === "agent" && <AgentChatStream />}
        {activeDockTab === "inspector" && <ClassInspectorTab />}
        {activeDockTab === "room" && sharedDiagramId && (
          <RoomChatPanelContainer diagramId={sharedDiagramId} />
        )}
      </div>
    </aside>
  )
}
