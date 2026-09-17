import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useState, type FC } from "react";
import { VersionListItem } from "./VersionListItem";
import { useVersioningTranslation } from "./strings";
import type { GroupedEntry } from "./utils";

interface AutoGroupRowProps {
  group: Extract<GroupedEntry, { kind: "auto-group" }>;
  diagramId: string;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
  onDelete: (versionId: string) => void;
  previewingVersionId: string | null;
  versionNumberById: Map<string, number>;
  latestSavedId?: string;
  hasUnsavedChanges: boolean;
}

export const AutoGroupRow: FC<AutoGroupRowProps> = ({
  group,
  diagramId,
  onPreview,
  onRestore,
  onDelete,
  previewingVersionId,
  versionNumberById,
  latestSavedId,
  hasUnsavedChanges,
}) => {
  const t = useVersioningTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="list-none mb-3">
      <div className="rounded-[var(--umlstudio-chrome-radius-md)] border border-[var(--uml-node-border)] bg-[var(--uml-node-bg)] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[var(--uml-node-bg-hover)] outline-none"
          aria-expanded={expanded}
          aria-label={t.autoGroupTitle(group.versions.length)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[11px] font-medium font-mono uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: "var(--uml-node-stereotype-bg)",
                color: "var(--uml-node-stereotype-color)",
                border:
                  "1px solid color-mix(in srgb, var(--uml-node-stereotype-color) 35%, transparent)",
              }}
            >
              {t.autoGroupStereotype}
            </span>
            <Layers className="size-3.5 text-[var(--umlstudio-text-muted)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--uml-node-header-title,var(--umlstudio-foreground))] truncate">
              {t.autoGroupTitle(group.versions.length)}
            </span>
          </div>

          <div className="flex items-center text-[var(--umlstudio-text-muted)]">
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </div>
        </button>

        {expanded && (
          <div className="p-2 border-t border-[var(--uml-node-header-border)] bg-[var(--uml-node-header-bg)]">
            <ul className="m-0 list-none p-0" role="list">
              {group.versions.map((v) => (
                <VersionListItem
                  key={v.id}
                  diagramId={diagramId}
                  version={v}
                  versionNumber={versionNumberById.get(v.id)}
                  isPreviewing={previewingVersionId === v.id}
                  canRestore={v.id !== latestSavedId || hasUnsavedChanges}
                  onPreview={onPreview}
                  onRestore={onRestore}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
};
