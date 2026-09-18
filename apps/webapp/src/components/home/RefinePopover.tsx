import { useState, type FC, type ReactElement, type ReactNode } from "react";
import type { UMLDiagramType } from "@umlstudio/core";
import { Button } from "@umlstudio/ui/components/button";
import { cn } from "@umlstudio/ui/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@umlstudio/ui/components/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@umlstudio/ui/components/sheet";
import { getDiagramTypeLabel } from "./diagramTypeMeta";
import {
  getHomeSortFieldOptions,
  getHomeSourceOptions,
  getHomeSortOrderOptions,
  type HomeChrome,
} from "./useHomeChrome";
import { useTranslation } from "@/i18n";
import { RotateCcw } from "lucide-react";

type RefineSegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
};

function RefineGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
  segmentClassName,
}: {
  label: string;
  options: readonly RefineSegmentOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  segmentClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.value)}
              className={cn(
                "h-8 rounded-lg px-3 text-xs font-medium transition-all duration-150 cursor-pointer",
                isSelected
                  ? "bg-(--dodger-blue) text-white font-semibold shadow-2xs"
                  : "border border-border/60 bg-muted/25 text-secondary-foreground hover:bg-muted/60 hover:text-foreground",
                segmentClassName,
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type RefineBodyProps = {
  chrome: HomeChrome;
  typeOptions: readonly UMLDiagramType[];
  segmentClassName?: string;
};

export const RefineBody: FC<RefineBodyProps> = ({
  chrome,
  typeOptions,
  segmentClassName,
}) => {
  const { t } = useTranslation();
  const typeSegments: RefineSegmentOption<HomeChrome["type"]>[] = [
    { value: "all", label: t.dashboard.filterTypeAll },
    ...typeOptions.map((type) => ({
      value: type,
      label: getDiagramTypeLabel(type),
    })),
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <RefineGroup
        label={t.dashboard.filterSource}
        options={getHomeSourceOptions(t)}
        value={chrome.source}
        onSelect={chrome.setSource}
        segmentClassName={segmentClassName}
      />

      {typeOptions.length > 1 && (
        <>
          <hr className="border-border/40" />
          <RefineGroup
            label={t.dashboard.filterType}
            options={typeSegments}
            value={chrome.type}
            onSelect={chrome.setType}
            segmentClassName={segmentClassName}
          />
        </>
      )}

      <hr className="border-border/40" />

      <RefineGroup
        label={t.dashboard.filterSortBy}
        options={getHomeSortFieldOptions(t)}
        value={chrome.sort.field}
        onSelect={chrome.setSortField}
        segmentClassName={segmentClassName}
      />

      <RefineGroup
        label={t.dashboard.filterOrder}
        options={getHomeSortOrderOptions(chrome.sort.field, t)}
        value={chrome.sort.order}
        onSelect={chrome.setSortOrder}
        segmentClassName={segmentClassName}
      />

      {chrome.refineCount > 0 && (
        <>
          <hr className="border-border/40" />
          <div className="flex justify-end pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={chrome.resetAll}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="size-3" />
              <span>{t.dashboard.filterClearAll}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export type RefinePopoverProps = RefineBodyProps & {
  trigger: ReactNode;
  variant: "popover" | "sheet";
};

export function RefinePopover({
  trigger,
  variant,
  chrome,
  typeOptions,
}: RefinePopoverProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={trigger as ReactElement} />

        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[80vh] gap-0 overflow-hidden"
        >
          <SheetHeader className="pb-3">
            <SheetTitle className="text-foreground">
              {t.dashboard.filterTitle}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <RefineBody
              chrome={chrome}
              typeOptions={typeOptions}
              segmentClassName="min-h-11"
            />
          </div>
          <SheetFooter className="pb-[calc(var(--umlstudio-chrome-edge-safe-bottom)+1rem)]">
            <SheetClose
              render={
                <Button type="button" variant="default">
                  {t.dashboard.filterDone}
                </Button>
              }
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger as ReactElement} />

      <PopoverContent
        aria-label={t.dashboard.filterTitle}
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border/60 bg-card p-4 shadow-lg backdrop-blur-md"
      >
        <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
          <span className="text-xs font-bold text-foreground">
            {t.dashboard.filterTitle}
          </span>
          {chrome.refineCount > 0 && (
            <button
              type="button"
              onClick={chrome.resetAll}
              className="text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              {t.dashboard.filterClearAll}
            </button>
          )}
        </div>
        <RefineBody chrome={chrome} typeOptions={typeOptions} />
      </PopoverContent>
    </Popover>
  );
}
