import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@umlstudio/ui/components/dialog";
import { cn } from "@umlstudio/ui/lib/utils";
import { getHomeDialogWidth } from "@/components/modals/HomeDialog";

export type ModalVariant =
  | "home-wide"
  | "home-compact"
  | "editor-share"
  | "plain"
  | "confirm";

type ModalFooterSlot = {
  element: HTMLElement | null;
  setHasFooterContent: (has: boolean) => void;
};

const ModalFooterSlotContext = createContext<ModalFooterSlot | null>(null);

export function useModalFooterSlot(): ModalFooterSlot | null {
  return useContext(ModalFooterSlotContext);
}

export function ModalFooterPortal({ children }: { children: ReactNode }) {
  const slot = useModalFooterSlot();
  const target = slot?.element ?? null;
  const setHasFooterContent = slot?.setHasFooterContent;
  const hasContent = children != null && children !== false;

  useEffect(() => {
    if (!target || !setHasFooterContent) return;
    setHasFooterContent(hasContent);
    return () => setHasFooterContent(false);
  }, [target, setHasFooterContent, hasContent]);

  if (!target) return <>{children}</>;
  return createPortal(children, target);
}

export function ModalFrame({
  title,
  variant,
  contentOverflow = false,
  onOpenChange,
  beforeBody,
  footer,
  children,
}: {
  title: string;
  variant: ModalVariant;
  contentOverflow?: boolean;
  onOpenChange?: (open: boolean) => void;
  beforeBody?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isEditorShareDialog = variant === "editor-share";
  const isConfirmDialog = variant === "confirm";
  const isHomeDialog =
    (variant !== "plain" && variant !== "confirm") || contentOverflow;
  const isWideHomeDialog = variant === "home-wide";
  const insetClamp =
    "calc(100vw - var(--safe-area-inset-left, 0px) - var(--safe-area-inset-right, 0px) - 24px)";

  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const [hasPortalFooter, setHasPortalFooter] = useState(false);

  const footerFilled = footer != null || hasPortalFooter;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-var(--safe-area-inset-top,0px)-var(--safe-area-inset-bottom,0px)-24px)] max-w-none flex-col gap-0 overflow-hidden p-0"
        style={{
          width: isEditorShareDialog
            ? `min(560px, ${insetClamp})`
            : isHomeDialog
              ? getHomeDialogWidth(isWideHomeDialog ? "wide" : "compact")
              : isConfirmDialog
                ? `min(440px, ${insetClamp})`
                : `min(600px, ${insetClamp})`,
          minWidth: isHomeDialog ? "320px" : 0,
          maxWidth:
            "calc(100vw - var(--safe-area-inset-left, 0px) - var(--safe-area-inset-right, 0px) - 24px)",
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border p-4 pr-12">
          <DialogTitle className="min-w-0 truncate">{title}</DialogTitle>
        </DialogHeader>

        {beforeBody}

        <div
          className={cn(
            "min-h-0 flex-1 p-4",
            contentOverflow ? "overflow-y-visible" : "overflow-y-auto",
          )}
        >
          <ModalFooterSlotContext.Provider
            value={{
              element: footerEl,
              setHasFooterContent: setHasPortalFooter,
            }}
          >
            {children}
          </ModalFooterSlotContext.Provider>
        </div>

        <div
          ref={setFooterEl}
          className={cn("shrink-0", footerFilled && "p-4")}
        >
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}
