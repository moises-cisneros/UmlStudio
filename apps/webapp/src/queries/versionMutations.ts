import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { UMLModel } from "@umlstudio/core";
import {
  getVersionRepository,
  type CreateVersionResult,
  type RepositoryKind,
} from "@/services/versionRepository";
import { useVersionStore } from "@/stores/useVersionStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { MAX_VERSIONS_PER_DIAGRAM } from "@/constants";
import type { VersionSummary } from "@/types";
import { versionKeys } from "./keys";
import { getCachedVersions, type VersionListData } from "./versionQueries";
import {
  patchVersionInList,
  removeVersionFromList,
  replaceVersionInList,
} from "./versionListCache";

function getActor(): string | undefined {
  // label mutations with the registered session name. The server
  // resolves authorship from the verified identity and ignores this value,
  // so it can never spoof another author.
  return useAuthStore.getState().user?.name ?? undefined;
}

function notifyEvictions(result: CreateVersionResult): void {
  const { evictedVersionIds, evictedKinds, cap: backendCap } = result;
  if (!evictedVersionIds || evictedVersionIds.length === 0) return;
  const namedCount = (evictedKinds ?? []).filter((k) => k === "named").length;
  const cap = backendCap ?? MAX_VERSIONS_PER_DIAGRAM;
  if (namedCount > 0) {
    toast.warning(
      namedCount === 1
        ? `Saved. Your oldest named version was removed — the ${cap}-version cap is full.`
        : `Saved. ${namedCount} oldest named versions were removed — the ${cap}-version cap is full.`,
      { autoClose: 8000 },
    );
  } else {
    const n = evictedVersionIds.length;
    toast.info(
      n === 1
        ? "Saved. An older autosave was removed to fit the version cap."
        : `Saved. ${n} older autosaves were removed to fit the version cap.`,
      { autoClose: 5000 },
    );
  }
}

export interface CreateVersionVariables {
  body: UMLModel;
  name?: string;
  description?: string;
}

export function useCreateVersionMutation(
  kind: RepositoryKind,
  diagramId: string,
  opts: {
    onCommitted?: (result: CreateVersionResult) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const repo = getVersionRepository(kind);
  const onCommittedRef = useRef(opts.onCommitted);
  useEffect(() => {
    onCommittedRef.current = opts.onCommitted;
  });
  return useMutation({
    mutationFn: ({ body, name, description }: CreateVersionVariables) =>
      repo.create(diagramId, body, {
        name,
        description,
        actor: getActor(),
      }),
    onSuccess: (result) => {
      notifyEvictions(result);
      onCommittedRef.current?.(result);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: versionKeys.list(kind, diagramId),
      }),
  });
}

export interface EditVersionInfoVariables {
  versionId: string;
  patch: { name?: string; description?: string };
}

export function useEditVersionInfoMutation(
  kind: RepositoryKind,
  diagramId: string,
) {
  const queryClient = useQueryClient();
  const repo = getVersionRepository(kind);
  const listKey = versionKeys.list(kind, diagramId);
  return useMutation({
    mutationFn: ({ versionId, patch }: EditVersionInfoVariables) =>
      repo.editInfo(diagramId, versionId, patch),
    onMutate: async ({ versionId, patch }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<VersionListData>(listKey);
      queryClient.setQueryData<VersionListData>(listKey, (data) =>
        patchVersionInList(data, versionId, patch),
      );
      return { previous };
    },
    onSuccess: (updated: VersionSummary) => {
      queryClient.setQueryData<VersionListData>(listKey, (data) =>
        replaceVersionInList(data, updated),
      );
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export function useDeleteVersionMutation(
  kind: RepositoryKind,
  diagramId: string,
) {
  const queryClient = useQueryClient();
  const repo = getVersionRepository(kind);
  const listKey = versionKeys.list(kind, diagramId);
  return useMutation({
    mutationFn: ({ versionId }: { versionId: string }) =>
      repo.delete(diagramId, versionId),
    onMutate: async ({ versionId }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<VersionListData>(listKey);
      queryClient.setQueryData<VersionListData>(listKey, (data) =>
        removeVersionFromList(data, versionId),
      );
      return { previous };
    },
    onSuccess: (_res, { versionId }) => {
      queryClient.removeQueries({
        queryKey: versionKeys.body(kind, diagramId, versionId),
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export interface RestoreVersionVariables {
  versionId: string;
  currentBody: UMLModel;
}

export function useRestoreVersionMutation(
  kind: RepositoryKind,
  diagramId: string,
) {
  const queryClient = useQueryClient();
  const repo = getVersionRepository(kind);
  return useMutation({
    mutationFn: ({ versionId, currentBody }: RestoreVersionVariables) =>
      repo.restore(diagramId, versionId, {
        currentBody,
        actor: getActor(),
      }),
    onMutate: ({ versionId }) => {
      useVersionStore.getState().beginRestore(versionId);
    },
    onSuccess: ({ autoSnapshotVersionId }, { versionId }) => {
      const restored = getCachedVersions(queryClient, kind, diagramId)?.find(
        (v) => v.id === versionId,
      );
      useVersionStore.getState().completeRestore({
        diagramId,
        autoSnapshotVersionId,
        restoredFromVersionId: versionId,
        restoredVersionName:
          restored?.description?.trim() ||
          restored?.name?.trim() ||
          (restored?.seq !== undefined
            ? `#${restored.seq}`
            : versionId.slice(0, 8)),
      });
      void queryClient.invalidateQueries({
        queryKey: versionKeys.list(kind, diagramId),
      });
    },
    onError: () => {
      useVersionStore.getState().cancelRestore();
    },
  });
}

export interface UndoRestoreVariables {
  diagramId: string;
  autoSnapshotVersionId: string;
  currentBody: UMLModel;
}

export function useUndoRestoreMutation(kind: RepositoryKind) {
  const queryClient = useQueryClient();
  const repo = getVersionRepository(kind);
  return useMutation({
    mutationFn: ({
      diagramId,
      autoSnapshotVersionId,
      currentBody,
    }: UndoRestoreVariables) =>
      repo.restore(diagramId, autoSnapshotVersionId, {
        currentBody,
        actor: getActor(),
      }),
    onMutate: ({ autoSnapshotVersionId }) => {
      useVersionStore.getState().beginRestore(autoSnapshotVersionId);
    },
    onSuccess: (_res, { diagramId }) => {
      const store = useVersionStore.getState();
      store.cancelRestore();
      store.dismissUndoRestore();
      void queryClient.invalidateQueries({
        queryKey: versionKeys.list(kind, diagramId),
      });
    },
    onError: () => {
      useVersionStore.getState().cancelRestore();
    },
  });
}
