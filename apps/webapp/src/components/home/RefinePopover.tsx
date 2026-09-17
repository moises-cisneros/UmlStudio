import { useState, type ReactElement, type ReactNode } from "react";
import type { UMLDiagramType } from "@umlstudio/core";
import { Button } from "@umlstudio/ui/components/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@umlstudio/ui/components/toggle-group";
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
import { GroupDivider } from "@/components/navbar/islandPrimitives";
import { getDiagramTypeLabel } from "./diagramTypeMeta";
import {
  getHomeSortFieldOptions,
  getHomeSourceOptions,
  getHomeSortOrderOptions,
  type HomeChrome,
} from "./useHomeChrome";
import { useTranslation } from "@/i18n";

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
      <span className="text-[11px] font-semibold tracking-wide text-[color:var(--umlstudio-chrome-text)] uppercase">
        {label}
      </span>
      <ToggleGroup
        aria-label={label}
        spacing={4}
        value={[value]}
        onValueChange={(next) => {
          const selected = next.find((option) => option !== value);
          if (selected !== undefined) {
            onSelect(selected as T);
          }
        }}
        className="flex-wrap"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className={cn(
              "min-h-[36px] rounded-[var(--umlstudio-chrome-radius-sm)] px-3 text-sm font-medium",
              segmentClassName,
            )}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export type RefineBodyProps = {
  chrome: HomeChrome;
  typeOptions: readonly UMLDiagramType[];
  segmentClassName?: string;
};

export function RefineBody({
  chrome,
  typeOptions,
  segmentClassName,
}: RefineBodyProps) {
  const { t } = useTranslation();
  const typeSegments: RefineSegmentOption<HomeChrome["type"]>[] = [
    { value: "all", label: t.dashboard.filterTypeAll },
    ...typeOptions.map((type) => ({
      value: type,
      label: getDiagramTypeLabel(type),
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <RefineGroup
        label={t.dashboard.filterSource}
        options={getHomeSourceOptions(t)}
        value={chrome.source}
        onSelect={chrome.setSource}
        segmentClassName={segmentClassName}
      />
      <GroupDivider />
      <RefineGroup
        label={t.dashboard.filterType}
        options={typeSegments}
        value={chrome.type}
        onSelect={chrome.setType}
        segmentClassName={segmentClassName}
      />
      <GroupDivider />
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
    </div>
  );
}

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
            <SheetTitle className="text-[color:var(--umlstudio-chrome-text)]">
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
        className="w-80 max-w-[calc(100vw-1.5rem)]"
      >
        <RefineBody chrome={chrome} typeOptions={typeOptions} />
      </PopoverContent>
    </Popover>
  );
}
