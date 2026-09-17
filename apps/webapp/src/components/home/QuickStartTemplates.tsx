import { type FC } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { usePersistenceModelStore } from "@/stores/usePersistenceModelStore";
import { prepareTemplateModel } from "@/utils/templateModels";
import { TemplateThumbnail } from "@/components/modals/TemplateThumbnail";
import { useTranslation } from "@/i18n";
import { log } from "@/logger";

interface QuickStartTemplatesProps {
  onNewDiagram: () => void;
}

type CanonicalTemplateKey =
  | "Adapter"
  | "Bridge"
  | "Command"
  | "Factory"
  | "Observer";

interface TemplateItem {
  id: string;
  isTemplate: boolean;
  name?: CanonicalTemplateKey;
  titleKey: "blank" | "adapter" | "bridge" | "command" | "factory" | "observer";
  descKey:
    | "blankDesc"
    | "adapterDesc"
    | "bridgeDesc"
    | "commandDesc"
    | "factoryDesc"
    | "observerDesc";
  badge?: string;
}

const TEMPLATE_ITEMS: TemplateItem[] = [
  {
    id: "blank",
    isTemplate: false,
    titleKey: "blank",
    descKey: "blankDesc",
  },
  {
    id: "adapter",
    isTemplate: true,
    name: "Adapter",
    titleKey: "adapter",
    descKey: "adapterDesc",
    badge: "GoF Structural",
  },
  {
    id: "bridge",
    isTemplate: true,
    name: "Bridge",
    titleKey: "bridge",
    descKey: "bridgeDesc",
    badge: "GoF Structural",
  },
  {
    id: "command",
    isTemplate: true,
    name: "Command",
    titleKey: "command",
    descKey: "commandDesc",
    badge: "GoF Behavioral",
  },
  {
    id: "factory",
    isTemplate: true,
    name: "Factory",
    titleKey: "factory",
    descKey: "factoryDesc",
    badge: "GoF Creational",
  },
  {
    id: "observer",
    isTemplate: true,
    name: "Observer",
    titleKey: "observer",
    descKey: "observerDesc",
    badge: "GoF Behavioral",
  },
];

export const QuickStartTemplates: FC<QuickStartTemplatesProps> = ({
  onNewDiagram,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createModel = usePersistenceModelStore((state) => state.createModel);

  const handleTemplateClick = async (item: TemplateItem) => {
    if (!item.isTemplate || !item.name) {
      onNewDiagram();
      return;
    }

    try {
      const jsonModule = await import(
        `../../../assets/diagramTemplates/${item.name}.json`
      );
      const jsonData = jsonModule.default;
      if (!jsonData) return;

      const templateModel = prepareTemplateModel(jsonData, {
        id: crypto.randomUUID(),
        title: `${item.name} Pattern`,
      });

      createModel(templateModel);
      navigate({ to: "/local/$id", params: { id: templateModel.id } });
    } catch (err) {
      log.error("Failed to load canonical template:", err as Error);
    }
  };

  return (
    <section className="mb-2">
      <div className="mb-6">
        <h2 className="text-2xl font-black tracking-tight text-(--home-text-primary)">
          {t.dashboard.quickStartTitle}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {TEMPLATE_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void handleTemplateClick(item)}
            className="group flex flex-col items-start overflow-hidden rounded-xl border border-border-subtle bg-surface text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-(--dodger-blue) hover:shadow-md focus:outline-none focus:ring-1 focus:ring-(--dodger-blue)"
          >
            {/* PREVIEW CONTAINER */}
            <div className="relative flex h-24 w-full items-center justify-center overflow-hidden border-b border-border-subtle bg-(--home-surface-raised)">
              {item.isTemplate && item.name ? (
                <div className="size-full p-2 transition-transform duration-200 group-hover:scale-105">
                  <TemplateThumbnail name={item.name} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 text-(--dodger-blue)">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-[rgba(53,144,243,0.12)]">
                    <Plus className="size-5" />
                  </div>
                </div>
              )}

              {item.badge && (
                <span className="absolute right-1.5 top-1.5 rounded bg-[rgba(0,0,0,0.4)] px-1.5 py-0.5 text-[9px] font-semibold text-(--periwinkle) backdrop-blur-xs">
                  {item.badge}
                </span>
              )}
            </div>

            {/* CARD CONTENT */}
            <div className="flex flex-1 flex-col justify-between p-2.5 w-full">
              <div>
                <div className="flex items-center gap-1.5">
                  {item.isTemplate && (
                    <Sparkles className="size-3 text-(--deep-sky-blue) shrink-0" />
                  )}
                  <h3 className="truncate text-xs font-semibold text-(--home-text-primary)">
                    {t.templates[item.titleKey]}
                  </h3>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-secondary-foreground">
                  {t.templates[item.descKey]}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
