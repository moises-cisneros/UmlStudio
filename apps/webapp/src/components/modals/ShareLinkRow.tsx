import { Check, Copy, Link2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@umlstudio/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";
import { DiagramView } from "@/types";
import { useTranslation } from "@/i18n";

export const MODE_OPTIONS = [
  { value: DiagramView.EDITOR, labelKey: "editorMode" },
  { value: DiagramView.LECTOR, labelKey: "lectorMode" },
] as const;

export const ShareLinkRow = ({
  link,
  copied,
  onCopy,
  mode,
  options,
  onSelectMode,
}: {
  link: string;
  copied: boolean;
  onCopy: () => void;
  mode: DiagramView;
  options: typeof MODE_OPTIONS;
  onSelectMode: (mode: DiagramView) => void;
}) => {
  const { t } = useTranslation();

  const getOptionLabel = (opt: (typeof options)[number]): string => {
    switch (opt.value) {
      case DiagramView.EDITOR:
        return t.share.editorMode;
      case DiagramView.LECTOR:
        return t.share.lectorMode;
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-stretch rounded-lg border border-[var(--umlstudio-border,#243046)] bg-[var(--umlstudio-surface-sunken,#0c101a)] p-1 transition-all focus-within:border-[var(--dodger-blue,#3590f3)] focus-within:ring-1 focus-within:ring-[var(--dodger-blue,#3590f3)]">
        <div className="flex items-center pl-2.5 pr-1 text-[var(--dodger-blue,#3590f3)]">
          <Link2 className="size-4 shrink-0" aria-hidden="true" />
        </div>

        <input
          type="text"
          aria-label={t.share.anyoneWithLink}
          value={link}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 grow bg-transparent px-2 font-mono text-xs text-[var(--umlstudio-foreground,#f8fafc)] outline-none placeholder:text-[var(--umlstudio-text-muted,#94a3b8)]"
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onCopy}
                className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all duration-150 ${
                  copied
                    ? "bg-[var(--color-success,#10b981)] text-white"
                    : "bg-[var(--dodger-blue,#3590f3)] text-white hover:bg-[var(--deep-sky-blue,#62bfed)]"
                }`}
                aria-label={copied ? t.share.copied : t.share.copyLink}
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>{t.share.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span>{t.share.copyLink}</span>
                  </>
                )}
              </button>
            }
          />
          <TooltipContent side="top">
            <span>{copied ? t.share.copied : t.share.copyLink}</span>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 text-xs">
        <span className="text-[var(--umlstudio-text-muted,#94a3b8)]">
          {t.share.accessLevel}:
        </span>
        <Select
          value={mode}
          onValueChange={(value) => onSelectMode(value as DiagramView)}
        >
          <SelectTrigger
            aria-label={t.share.accessLevel}
            className="h-8 gap-1.5 rounded-md border border-[var(--umlstudio-border,#243046)] bg-[var(--umlstudio-surface,#151d2e)] px-3 text-xs font-medium text-[var(--umlstudio-foreground,#f8fafc)] hover:bg-[var(--umlstudio-surface-hover,#1e293f)] hover:border-[var(--deep-sky-blue,#62bfed)] transition-colors"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[var(--umlstudio-border,#243046)] bg-[var(--umlstudio-surface,#151d2e)] text-[var(--umlstudio-foreground,#f8fafc)]">
            {options.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                className="text-xs hover:bg-[var(--umlstudio-surface-hover,#1e293f)] focus:bg-[var(--umlstudio-surface-hover,#1e293f)]"
              >
                {getOptionLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
