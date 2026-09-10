import { useCallback, useRef, useSyncExternalStore } from "react";
import type { UmlStudioEditor } from "@umlstudio/core";
import { useTranslation } from "@/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@umlstudio/ui/components/tooltip";

export interface Collaborator {
  id: string;
  name?: string;
  color?: string;
  imageUrl?: string;
  clientIds?: number[];
  isLocal?: boolean;
}

interface CollaboratorPresenceProps {
  editor?: UmlStudioEditor;
}

const EMPTY_COLLABORATORS: Collaborator[] = [];

function sameCollaborators(a: Collaborator[], b: Collaborator[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const current = a[i];
    const incoming = b[i];
    if (
      current.id !== incoming.id ||
      current.name !== incoming.name ||
      current.color !== incoming.color ||
      current.imageUrl !== incoming.imageUrl ||
      current.isLocal !== incoming.isLocal ||
      (current.clientIds?.length ?? 0) !== (incoming.clientIds?.length ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

function readCollaborators(editor?: UmlStudioEditor): Collaborator[] {
  if (!editor?.getCollaborators) return EMPTY_COLLABORATORS;
  try {
    return (editor.getCollaborators() as Collaborator[]) ?? EMPTY_COLLABORATORS;
  } catch {
    return EMPTY_COLLABORATORS;
  }
}

export function CollaboratorPresence({ editor }: CollaboratorPresenceProps) {
  const snapshotRef = useRef<Collaborator[]>(EMPTY_COLLABORATORS);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor?.subscribeToCollaboratorChanges) {
        snapshotRef.current = EMPTY_COLLABORATORS;
        return () => {};
      }
      snapshotRef.current = readCollaborators(editor);
      const subId = editor.subscribeToCollaboratorChanges((incoming) => {
        const next = incoming ?? EMPTY_COLLABORATORS;
        if (!sameCollaborators(snapshotRef.current, next)) {
          snapshotRef.current = next;
          onStoreChange();
        }
      });
      return () => {
        editor.unsubscribe(subId);
      };
    },
    [editor],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const collaborators = useSyncExternalStore(subscribe, getSnapshot);

  const { t } = useTranslation();

  if (collaborators.length === 0) {
    return null;
  }

  const visibleCollaborators = collaborators.slice(0, 3);
  const overflowCount = collaborators.length - visibleCollaborators.length;

  return (
    <div
      className="flex items-center -space-x-1.5 overflow-hidden py-0.5"
      aria-label={t.collaborators.activeUsers}
    >
      {visibleCollaborators.map((collab) => {
        const initials = collab.name
          ? collab.name
              .split(" ")
              .map((part: string) => part[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
          : collab.isLocal
            ? t.collaborators.you.slice(0, 2).toUpperCase()
            : "U";

        const badgeColor = collab.color || "var(--dodger-blue)";

        return (
          <Tooltip key={collab.id}>
            <TooltipTrigger
              render={
                <div
                  tabIndex={0}
                  role="img"
                  aria-label={`${collab.name || t.collaborators.activeUsers} (${collab.isLocal ? t.collaborators.you : t.collaborators.online})`}
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 transition-transform hover:z-10 hover:scale-110 focus:outline-none"
                  style={{
                    backgroundColor: badgeColor,
                    borderColor: "var(--home-surface-base)",
                  }}
                >
                  {collab.imageUrl ? (
                    <img
                      src={collab.imageUrl}
                      alt={collab.name ?? "Avatar"}
                      className="size-full rounded-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-surface bg-(--color-success)"
                    title={t.collaborators.online}
                  />
                </div>
              }
            />
            <TooltipContent>
              <div className="flex flex-col text-xs">
                <span className="font-semibold">
                  {collab.name || t.collaborators.activeUsers}
                  {collab.isLocal ? ` (${t.collaborators.you})` : ""}
                </span>
                <span className="text-[10px] text-secondary-foreground">
                  {t.collaborators.online}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      {overflowCount > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                tabIndex={0}
                role="status"
                aria-label={`+${overflowCount} ${t.collaborators.activeUsers}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-(--home-surface-raised) text-[10px] font-bold text-secondary-foreground shadow-sm ring-2 ring-surface transition-transform hover:z-10 hover:scale-110 focus:outline-none"
              >
                +{overflowCount}
              </div>
            }
          />
          <TooltipContent>
            <span>{`+${overflowCount} ${t.collaborators.activeUsers}`}</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
