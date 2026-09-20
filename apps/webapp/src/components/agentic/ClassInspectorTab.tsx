import { type FC } from "react";
import { useEditorContext } from "@/contexts";
import { useTranslation } from "@/i18n";

export const ClassInspectorTab: FC = () => {
  const { editor } = useEditorContext();
  const { t } = useTranslation();
  const model = editor?.model;
  const nodes = model?.nodes ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto pr-1 text-xs">
      <div className="mb-3">
        <h4 className="font-semibold text-(--home-text-primary)">
          {t.agent.inspectorTitle}
        </h4>
        <p className="text-[11px] text-secondary-foreground">
          {nodes.length > 0
            ? `${nodes.length} element(s)`
            : t.agent.noSelectionDesc}
        </p>
      </div>

      <div className="space-y-2.5">
        {nodes.map((node) => {
          const name =
            typeof node.data?.name === "string" && node.data.name
              ? node.data.name
              : `Element (${node.type})`;
          const width = Math.round(node.width || node.measured?.width || 0);
          const height = Math.round(node.height || node.measured?.height || 0);

          return (
            <div
              key={node.id}
              className="rounded-lg border border-border-subtle bg-(--home-surface-raised) p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-(--dodger-blue)">{name}</span>
                <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] text-(--periwinkle) italic">
                  &lt;&lt;{node.type}&gt;&gt;
                </span>
              </div>

              <div className="mt-2 space-y-1 font-mono text-[11px] text-secondary-foreground">
                <div>
                  X: {Math.round(node.position?.x ?? 0)}, Y:{" "}
                  {Math.round(node.position?.y ?? 0)}
                </div>
                {width > 0 && height > 0 && (
                  <div>
                    {width} × {height} px
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
