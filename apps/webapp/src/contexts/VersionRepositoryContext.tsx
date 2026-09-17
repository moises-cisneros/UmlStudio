import { createContext, use, type ReactNode } from "react";
import type { RepositoryKind } from "@/services/versionRepository";

const VersionRepositoryContext = createContext<RepositoryKind | null>(null);

export const VersionRepositoryProvider = ({
  kind,
  children,
}: {
  kind: RepositoryKind;
  children: ReactNode;
}) => (
  <VersionRepositoryContext value={kind}>{children}</VersionRepositoryContext>
);

export function useVersionRepositoryKind(): RepositoryKind {
  const kind = use(VersionRepositoryContext);
  if (!kind) {
    throw new Error(
      "useVersionRepositoryKind must be used within a VersionRepositoryProvider",
    );
  }
  return kind;
}
