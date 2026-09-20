import type { ReactNode } from "react"
import { UMLSTUDIO_SHORTCUTS, type UmlStudioShortcutId } from "@umlstudio/core"
import { Button } from "@umlstudio/ui/components/button"
import { DialogFooter } from "@umlstudio/ui/components/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@umlstudio/ui/components/tabs"
import type { HelpMenuVariant } from "@/components/home/HomeHelpMenu"
import { EDITOR_SHORTCUTS, type EditorShortcutId } from "@/hooks/useEditorShortcuts"
import { formatCombo, keycaps, type Keycaps } from "@/utils/shortcutCaps"
import { useTranslation } from "@/i18n"
import type { TranslationDictionary } from "@/i18n/types"
import NodeCreation from "assets/images/how-to-use-node-creation.png"
import EdgeCreation from "assets/images/how-to-use-edge-creation.png"
import NodeEdit from "assets/images/how-to-use-node-edit.png"
import NodeMove from "assets/images/how-to-use-node-move.png"

type HowToUseModalProps = {
  variant: HelpMenuVariant
  isMac?: boolean
  onClose: () => void
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-md border border-border/80 bg-muted/80 px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-[0_1px_0_1px_rgba(0,0,0,0.08)]">
    {children}
  </kbd>
)

const Keys = ({ keys, caps }: { keys: string[]; caps: Keycaps }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {keys.map((key, index) => (
      <span key={key} className="inline-flex items-center gap-1">
        {index > 0 && !caps.isMac && <span className="text-muted-foreground">+</span>}
        <Kbd>{key}</Kbd>
      </span>
    ))}
  </span>
)

type Step = {
  title: string
  description: ReactNode
  image?: string
  alt?: string
}

const steps = (caps: Keycaps, t: TranslationDictionary): Step[] => [
  {
    title: t.help.stepAddNodeTitle,
    description: t.help.stepAddNodeDesc,
    image: NodeCreation,
    alt: "Dragging a palette element onto the canvas to create a node",
  },
  {
    title: t.help.stepAddEdgeTitle,
    description: t.help.stepAddEdgeDesc,
    image: EdgeCreation,
    alt: "Two class nodes connected by an association edge",
  },
  {
    title: t.help.stepEditClassTitle,
    description: t.help.stepEditClassDesc,
    image: NodeEdit,
    alt: "The class edit popover open beside a selected node",
  },
  {
    title: t.help.stepDeleteClassTitle,
    description: (
      <>
        {t.help.stepDeleteClassDesc} <Kbd>{caps.delete}</Kbd>.
      </>
    ),
  },
  {
    title: t.help.stepMoveClassTitle,
    description: t.help.stepMoveClassDesc,
    image: NodeMove,
    alt: "A selected class node showing its move and delete affordances",
  },
  {
    title: t.help.stepUndoRedoTitle,
    description: (
      <>
        <Keys keys={[caps.mod, "Z"]} caps={caps} /> {t.help.stepUndoRedoDesc}{" "}
        <Keys
          keys={caps.isMac ? [caps.shift, caps.mod, "Z"] : [caps.mod, caps.shift, "Z"]}
          caps={caps}
        />
      </>
    ),
  },
]

type Shortcut = {
  combos: string[][]
  label: string
}

type ShortcutGroup = {
  title: string
  shortcuts: Shortcut[]
}

type GroupTitle = "Selection" | "Editing" | "History" | "View" | "File"

const libraryShortcuts = (
  caps: Keycaps,
  t: TranslationDictionary
): Record<
  UmlStudioShortcutId,
  { label: string; group: GroupTitle; displayCombos?: string[][] }
> => ({
  "select-all": { label: t.help.selectAll, group: "Selection" },
  "clear-selection": { label: t.help.clearSelection, group: "Selection" },
  delete: {
    label: t.help.deleteSelection,
    group: "Editing",
    displayCombos: [[caps.delete]],
  },
  copy: { label: t.help.copy, group: "Editing" },
  cut: { label: t.help.cut, group: "Editing" },
  paste: { label: t.help.paste, group: "Editing" },
  duplicate: { label: t.help.duplicate, group: "Editing" },
  "move-selection": {
    label: t.help.nudgeSelection,
    group: "Editing",
    displayCombos: [["←"], ["↑"], ["→"], ["↓"]],
  },
  undo: { label: t.help.undo, group: "History" },
  redo: { label: t.help.redo, group: "History" },
  "zoom-in": { label: t.help.zoomIn, group: "View" },
  "zoom-out": { label: t.help.zoomOut, group: "View" },
  "reset-zoom": { label: t.help.resetZoom, group: "View" },
  "fit-view": { label: t.help.fitView, group: "View" },
  "zoom-to-selection": { label: t.help.zoomToSelection, group: "View" },
})

const getEditorShortcutMeta = (
  t: TranslationDictionary
): Record<EditorShortcutId, { label: string; group: GroupTitle }> => ({
  "save-version": { label: t.help.saveVersion, group: "File" },
  "toggle-version-history": {
    label: t.help.toggleVersionHistory,
    group: "File",
  },
  "new-diagram": { label: t.help.newDiagram, group: "File" },
  "share-diagram": { label: t.help.shareDiagram, group: "File" },
  "api-docs": { label: t.help.apiDocs, group: "File" },
  "toggle-multiselect": { label: t.help.multiSelectMode, group: "Selection" },
  "help-modal": { label: t.menu.help, group: "File" },
})

const gestures = (
  caps: Keycaps,
  t: TranslationDictionary
): Partial<Record<GroupTitle, Shortcut[]>> => ({
  Selection: [
    { combos: [[caps.shift, "Click"]], label: t.help.gestureAddRemove },
    { combos: [[caps.shift, "Drag"]], label: t.help.gestureBoxSelect },
  ],
  View: [
    { combos: [["Scroll"], ["Drag"]], label: t.help.gesturePan },
    { combos: [[caps.mod, "Scroll"]], label: t.help.gestureZoom },
  ],
})

const ALL_GROUPS: GroupTitle[] = ["File", "Editing", "Selection", "View", "History"]
const CANVAS_GROUPS: GroupTitle[] = ["Editing", "Selection", "View", "History"]

const getGroupTitleLabel = (group: GroupTitle, t: TranslationDictionary): string => {
  switch (group) {
    case "Selection":
      return t.help.groupSelection
    case "Editing":
      return t.help.groupEditing
    case "History":
      return t.help.groupHistory
    case "View":
      return t.help.groupView
    case "File":
      return t.help.groupFile
  }
}

const shortcutGroups = (
  caps: Keycaps,
  variant: HelpMenuVariant,
  t: TranslationDictionary
): ShortcutGroup[] => {
  const library = libraryShortcuts(caps, t)
  const canvasGestures = gestures(caps, t)
  const editorMeta = getEditorShortcutMeta(t)

  const activeGroups = variant === "editor" ? ALL_GROUPS : CANVAS_GROUPS

  return activeGroups.map((title) => {
    const coreShortcuts = UMLSTUDIO_SHORTCUTS.filter(
      (shortcut) => library[shortcut.id]?.group === title
    ).map(({ id, combos }) => ({
      label: library[id].label,
      combos: library[id].displayCombos ?? [formatCombo(combos[0], caps)],
    }))

    const editorList =
      variant === "editor"
        ? EDITOR_SHORTCUTS.filter((s) => editorMeta[s.id]?.group === title).map(
            ({ id, combo }) => ({
              label: editorMeta[id].label,
              combos: [formatCombo(combo, caps)],
            })
          )
        : []

    return {
      title: getGroupTitleLabel(title, t),
      shortcuts: [...coreShortcuts, ...editorList, ...(canvasGestures[title] ?? [])],
    }
  })
}

const Walkthrough = ({ caps, t }: { caps: Keycaps; t: TranslationDictionary }) => (
  <ol className="flex flex-col gap-4">
    {steps(caps, t).map((step, idx) => (
      <li
        key={step.title}
        className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card/40 p-4 shadow-xs transition-colors hover:border-border"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-(--dodger-blue)/15 text-xs font-bold text-(--dodger-blue)">
            {idx + 1}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed pl-8">{step.description}</p>
        {step.image && (
          <div className="mt-1 ml-8 overflow-hidden rounded-lg border border-border/70 bg-muted/20">
            <img
              src={step.image}
              alt={step.alt}
              loading="lazy"
              className="block w-full object-contain"
            />
          </div>
        )}
      </li>
    ))}
  </ol>
)

const Shortcuts = ({
  groups,
  caps,
  t,
}: {
  groups: ShortcutGroup[]
  caps: Keycaps
  t: TranslationDictionary
}) => (
  <div className="flex flex-col gap-3.5">
    {groups.map((group) => (
      <div
        key={group.title}
        className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card/40 p-3.5 shadow-xs"
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-(--dodger-blue)" />
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </p>
        </div>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 text-xs">
          {group.shortcuts.map((shortcut) => (
            <div key={shortcut.label} className="contents">
              <dt className="text-foreground font-medium">{shortcut.label}</dt>
              <dd className="flex items-center justify-end gap-1.5 text-right">
                {shortcut.combos.map((combo, comboIndex) => (
                  <span key={combo.join("+")} className="inline-flex items-center gap-1.5">
                    {comboIndex > 0 && (
                      <span className="text-[11px] text-muted-foreground">{t.help.or}</span>
                    )}
                    <Keys keys={combo} caps={caps} />
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ))}
    <p className="text-xs text-muted-foreground italic px-1 pt-1">{t.help.shortcutsDisclaimer}</p>
  </div>
)

export const HowToUseModal = ({ variant, isMac, onClose }: HowToUseModalProps) => {
  const { t } = useTranslation()
  const caps = keycaps(isMac)

  return (
    <div className="flex flex-col gap-5 text-foreground">
      <Tabs defaultValue="walkthrough" className="gap-5">
        <TabsList className="w-full grid grid-cols-2 rounded-xl p-1 bg-muted/60 border border-border/50">
          <TabsTrigger value="walkthrough" className="rounded-lg text-xs font-semibold">
            {t.help.tabWalkthrough}
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="rounded-lg text-xs font-semibold">
            {t.help.tabShortcuts}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="walkthrough" className="max-h-[60vh] overflow-y-auto pr-1">
          <Walkthrough caps={caps} t={t} />
        </TabsContent>
        <TabsContent value="shortcuts" className="max-h-[60vh] overflow-y-auto pr-1">
          <Shortcuts groups={shortcutGroups(caps, variant, t)} caps={caps} t={t} />
        </TabsContent>
      </Tabs>
      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onClose} className="rounded-xl">
          {t.help.close}
        </Button>
      </DialogFooter>
    </div>
  )
}
