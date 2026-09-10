import { Check, Copy } from "lucide-react";
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
  { value: DiagramView.COLLABORATE, labelKey: "collaborateMode" },
  { value: DiagramView.EDIT, labelKey: "editMode" },
  { value: DiagramView.GIVE_FEEDBACK, labelKey: "addFeedbackMode" },
  { value: DiagramView.SEE_FEEDBACK, labelKey: "viewFeedbackMode" },
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

  return (
    <div className="flex items-stretch">
      <input
        type="text"
        aria-label="Shareable link"
        value={link}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 grow rounded-l-md border border-r-0 px-3 text-xs outline-none"
        style={{
          borderColor: "var(--home-border-default)",
          background: "var(--home-surface-sunken)",
          color: "var(--home-text-secondary)",
        }}
      />

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onCopy}
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-r-0 transition-colors duration-150 hover:opacity-80"
              style={{
                borderColor: "var(--home-border-default)",
                background: copied
                  ? "var(--home-accent-soft)"
                  : "var(--home-surface-raised)",
                color: copied
                  ? "var(--home-accent-base)"
                  : "var(--home-text-secondary)",
              }}
              aria-label="Copy link"
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </button>
          }
        />
        <TooltipContent side="top">
          <span>{copied ? t.common.copied : t.common.copy}</span>
        </TooltipContent>
      </Tooltip>

      <Select
        value={mode}
        onValueChange={(value) => onSelectMode(value as DiagramView)}
      >
        <SelectTrigger
          aria-label="Link access mode"
          className="gap-1.5 border px-3 text-xs font-medium transition-colors duration-150 hover:opacity-80"
          style={{
            height: "2.25rem",
            borderRadius: "0 0.375rem 0.375rem 0",
            borderColor: "var(--home-border-default)",
            background: "var(--home-surface-raised)",
            color: "var(--home-text-primary)",
            minWidth: "max-content",
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t.share[opt.labelKey]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
