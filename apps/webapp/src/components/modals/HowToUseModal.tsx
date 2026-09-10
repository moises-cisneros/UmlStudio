import type { ReactNode } from "react";
import { UMLSTUDIO_SHORTCUTS, type UmlStudioShortcutId } from "@umlstudio/core";
import { Button } from "@umlstudio/ui/components/button";
import { DialogFooter } from "@umlstudio/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@umlstudio/ui/components/tabs";
import { Separator } from "@umlstudio/ui/components/separator";
import type { HelpMenuVariant } from "@/components/home/HomeHelpMenu";
import {
  EDITOR_SHORTCUTS,
  type EditorShortcutId,
} from "@/hooks/useEditorShortcuts";
import { formatCombo, keycaps, type Keycaps } from "@/utils/shortcutCaps";
import NodeCreation from "assets/images/how-to-use-node-creation.png";
import EdgeCreation from "assets/images/how-to-use-edge-creation.png";
import NodeEdit from "assets/images/how-to-use-node-edit.png";
import NodeMove from "assets/images/how-to-use-node-move.png";

type HowToUseModalProps = {
  variant: HelpMenuVariant;
  isMac?: boolean;
  onClose: () => void;
};

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground">
    {children}
  </kbd>
);

const Keys = ({ keys, caps }: { keys: string[]; caps: Keycaps }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    {keys.map((key, index) => (
      <span key={key} className="inline-flex items-center gap-1">
        {index > 0 && !caps.isMac && (
          <span className="text-muted-foreground">+</span>
        )}
        <Kbd>{key}</Kbd>
      </span>
    ))}
  </span>
);

type Step = {
  title: string;
  description: ReactNode;
  image?: string;
  alt?: string;
};

const steps = (caps: Keycaps): Step[] => [
  {
    title: "Add Node",
    description:
      "Drag and drop one of the elements on the left side into the editor area.",
    image: NodeCreation,
    alt: "Dragging a palette element onto the canvas to create a node",
  },
  {
    title: "Add Edge",
    description:
      "Select the source class with a single click — blue circles appear around it marking the connection points. Click and hold one, then drag it to another node to create an edge.",
    image: EdgeCreation,
    alt: "Two class nodes connected by an association edge",
  },
  {
    title: "Edit Class",
    description:
      "Double-click a class to open its editor, where you can change its name, stereotype, attributes and methods.",
    image: NodeEdit,
    alt: "The class edit popover open beside a selected node",
  },
  {
    title: "Delete Class",
    description: (
      <>
        Select it with a single click and press <Kbd>{caps.delete}</Kbd>.
      </>
    ),
  },
  {
    title: "Move Class",
    description:
      "Select it with a single click, then use the arrow keys or drag and drop it.",
    image: NodeMove,
    alt: "A selected class node showing its move and delete affordances",
  },
  {
    title: "Undo & Redo",
    description: (
      <>
        Press <Keys keys={[caps.mod, "Z"]} caps={caps} /> to undo and{" "}
        <Keys
          keys={
            caps.isMac
              ? [caps.shift, caps.mod, "Z"]
              : [caps.mod, caps.shift, "Z"]
          }
          caps={caps}
        />{" "}
        to redo your changes.
      </>
    ),
  },
];

type Shortcut = {
  combos: string[][];
  label: string;
};

type ShortcutGroup = {
  title: string;
  shortcuts: Shortcut[];
};

type GroupTitle = "Selection" | "Editing" | "History" | "View" | "File";

const libraryShortcuts = (
  caps: Keycaps,
): Record<
  UmlStudioShortcutId,
  { label: string; group: GroupTitle; displayCombos?: string[][] }
> => ({
  "select-all": { label: "Select all", group: "Selection" },
  "clear-selection": { label: "Clear selection", group: "Selection" },
  delete: {
    label: "Delete selection",
    group: "Editing",
    displayCombos: [[caps.delete]],
  },
  copy: { label: "Copy", group: "Editing" },
  cut: { label: "Cut", group: "Editing" },
  paste: { label: "Paste", group: "Editing" },
  duplicate: { label: "Duplicate", group: "Editing" },
  "move-selection": {
    label: "Nudge selection",
    group: "Editing",
    displayCombos: [["←"], ["↑"], ["→"], ["↓"]],
  },
  undo: { label: "Undo", group: "History" },
  redo: { label: "Redo", group: "History" },
  "zoom-in": { label: "Zoom in", group: "View" },
  "zoom-out": { label: "Zoom out", group: "View" },
  "reset-zoom": { label: "Zoom to 100%", group: "View" },
  "fit-view": { label: "Zoom to fit", group: "View" },
  "zoom-to-selection": { label: "Zoom to selection", group: "View" },
});

const EDITOR_SHORTCUT_LABELS: Record<EditorShortcutId, string> = {
  "save-as-json": "Save as JSON",
  "save-version": "Save a version",
  "toggle-version-history": "Toggle version history",
};

const gestures = (caps: Keycaps): Partial<Record<GroupTitle, Shortcut[]>> => ({
  Selection: [
    { combos: [[caps.shift, "Click"]], label: "Add / remove from selection" },
    { combos: [[caps.shift, "Drag"]], label: "Box-select an area" },
  ],
  View: [
    { combos: [["Scroll"], ["Drag"]], label: "Pan the canvas" },
    { combos: [[caps.mod, "Scroll"]], label: "Zoom in / out" },
  ],
});

const CANVAS_GROUPS: GroupTitle[] = ["Selection", "Editing", "History", "View"];

const shortcutGroups = (
  caps: Keycaps,
  variant: HelpMenuVariant,
): ShortcutGroup[] => {
  const library = libraryShortcuts(caps);
  const canvasGestures = gestures(caps);

  const canvas = CANVAS_GROUPS.map((title) => ({
    title,
    shortcuts: [
      ...UMLSTUDIO_SHORTCUTS.filter(
        (shortcut) => library[shortcut.id].group === title,
      ).map(({ id, combos }) => ({
        label: library[id].label,
        combos: library[id].displayCombos ?? [formatCombo(combos[0], caps)],
      })),
      ...(canvasGestures[title] ?? []),
    ],
  }));

  if (variant !== "editor") return canvas;

  return [
    ...canvas,
    {
      title: "File",
      shortcuts: EDITOR_SHORTCUTS.map(({ id, combo }) => ({
        label: EDITOR_SHORTCUT_LABELS[id],
        combos: [formatCombo(combo, caps)],
      })),
    },
  ];
};

const Walkthrough = ({ caps }: { caps: Keycaps }) => (
  <ol className="flex flex-col gap-8">
    {steps(caps).map((step) => (
      <li key={step.title} className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{step.title}</h3>
        <p className="text-sm text-muted-foreground">{step.description}</p>
        {step.image && (
          <img
            src={step.image}
            alt={step.alt}
            loading="lazy"
            className="mt-1 block w-full rounded-lg border border-border"
          />
        )}
      </li>
    ))}
  </ol>
);

const Shortcuts = ({
  groups,
  caps,
}: {
  groups: ShortcutGroup[];
  caps: Keycaps;
}) => (
  <div className="flex flex-col gap-5">
    {groups.map((group, groupIndex) => (
      <div key={group.title} className="flex flex-col gap-3">
        {groupIndex > 0 && <Separator />}

        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {group.title}
        </p>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2.5">
          {group.shortcuts.map((shortcut) => (
            <div key={shortcut.label} className="contents">
              <dt className="text-sm text-foreground">{shortcut.label}</dt>
              <dd className="flex items-center justify-end gap-1.5 text-right">
                {shortcut.combos.map((combo, comboIndex) => (
                  <span
                    key={combo.join("+")}
                    className="inline-flex items-center gap-1.5"
                  >
                    {comboIndex > 0 && (
                      <span className="text-xs text-muted-foreground">or</span>
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
    <p className="text-xs text-muted-foreground">
      Shortcuts are ignored while editing text in a field — except saving as
      JSON, which always works.
    </p>
  </div>
);

export const HowToUseModal = ({
  variant,
  isMac,
  onClose,
}: HowToUseModalProps) => {
  const caps = keycaps(isMac);

  return (
    <div className="flex flex-col gap-6 text-foreground">
      <Tabs defaultValue="walkthrough" className="gap-6">
        <TabsList className="w-full">
          <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
        </TabsList>
        <TabsContent value="walkthrough">
          <Walkthrough caps={caps} />
        </TabsContent>
        <TabsContent value="shortcuts">
          <Shortcuts groups={shortcutGroups(caps, variant)} caps={caps} />
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
};
