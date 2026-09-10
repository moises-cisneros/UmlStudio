import { useCallback, useMemo, useState } from "react";
import type { UMLDiagramType } from "@umlstudio/core";
import { getDiagramTypeLabel } from "./diagramTypeMeta";

export type HomeSource = "all" | "local" | "shared";

export type HomeTypeFilter = "all" | UMLDiagramType;

export type HomeSortField = "alphabetical" | "dateCreated" | "lastModified";

export type HomeSortOrder = "oldest" | "newest";

export type HomeSort = {
  field: HomeSortField;
  order: HomeSortOrder;
};

export const DEFAULT_HOME_SORT: HomeSort = {
  field: "lastModified",
  order: "newest",
};

import { useTranslation } from "@/i18n";
import type { TranslationDictionary } from "@/i18n/types";

export const getHomeSourceOptions = (t: TranslationDictionary) =>
  [
    { value: "all", label: t.dashboard.filterSourceAll },
    { value: "local", label: t.dashboard.filterSourceLocal },
    { value: "shared", label: t.dashboard.filterSourceShared },
  ] as const;

export const getHomeSortFieldOptions = (t: TranslationDictionary) =>
  [
    { value: "alphabetical", label: t.dashboard.filterSortAlphabetical },
    { value: "dateCreated", label: t.dashboard.filterSortDateCreated },
    { value: "lastModified", label: t.dashboard.filterSortLastModified },
  ] as const;

export const getHomeSortOrderOptions = (
  field: HomeSortField,
  t: TranslationDictionary,
): readonly { value: HomeSortOrder; label: string }[] =>
  field === "alphabetical"
    ? [
        { value: "oldest", label: t.dashboard.filterOrderAZ },
        { value: "newest", label: t.dashboard.filterOrderZA },
      ]
    : [
        { value: "newest", label: t.dashboard.filterOrderNewest },
        { value: "oldest", label: t.dashboard.filterOrderOldest },
      ];

const sourceLabel = (source: HomeSource, t: TranslationDictionary) =>
  getHomeSourceOptions(t).find((option) => option.value === source)?.label ??
  source;

const sortFieldLabel = (field: HomeSortField, t: TranslationDictionary) =>
  getHomeSortFieldOptions(t).find((option) => option.value === field)?.label ??
  field;

const sortOrderLabel = (sort: HomeSort, t: TranslationDictionary) =>
  getHomeSortOrderOptions(sort.field, t).find(
    (option) => option.value === sort.order,
  )?.label ?? sort.order;

export type RefinementKind = "favorites" | "source" | "type" | "sort";

export type ActiveRefinement = {
  key: RefinementKind;
  label: string;
  clear: () => void;
};

export type HomeChrome = {
  searchTerm: string;
  setSearchTerm: (value: string) => void;

  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean) => void;
  toggleFavoritesOnly: () => void;

  source: HomeSource;
  setSource: (value: HomeSource) => void;

  type: HomeTypeFilter;
  setType: (value: HomeTypeFilter) => void;

  sort: HomeSort;
  setSort: (value: HomeSort) => void;
  setSortField: (field: HomeSortField) => void;
  setSortOrder: (order: HomeSortOrder) => void;

  resetAll: () => void;

  activeRefinements: ActiveRefinement[];

  refineCount: number;
};

const isDefaultSort = (sort: HomeSort) =>
  sort.field === DEFAULT_HOME_SORT.field &&
  sort.order === DEFAULT_HOME_SORT.order;

export function useHomeChrome(initialSearchTerm = ""): HomeChrome {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [source, setSource] = useState<HomeSource>("all");
  const [type, setType] = useState<HomeTypeFilter>("all");
  const [sort, setSort] = useState<HomeSort>(DEFAULT_HOME_SORT);

  const toggleFavoritesOnly = useCallback(
    () => setFavoritesOnly((current) => !current),
    [],
  );

  const setSortField = useCallback(
    (field: HomeSortField) => setSort((current) => ({ ...current, field })),
    [],
  );

  const setSortOrder = useCallback(
    (order: HomeSortOrder) => setSort((current) => ({ ...current, order })),
    [],
  );

  const resetAll = useCallback(() => {
    setSearchTerm("");
    setFavoritesOnly(false);
    setSource("all");
    setType("all");
    setSort(DEFAULT_HOME_SORT);
  }, []);

  const activeRefinements = useMemo<ActiveRefinement[]>(() => {
    const chips: ActiveRefinement[] = [];

    if (favoritesOnly) {
      chips.push({
        key: "favorites",
        label: "Favorites",
        clear: () => setFavoritesOnly(false),
      });
    }

    if (source !== "all") {
      chips.push({
        key: "source",
        label: sourceLabel(source, t),
        clear: () => setSource("all"),
      });
    }

    if (type !== "all") {
      chips.push({
        key: "type",
        label: getDiagramTypeLabel(type),
        clear: () => setType("all"),
      });
    }

    if (!isDefaultSort(sort)) {
      chips.push({
        key: "sort",
        label: `${sortFieldLabel(sort.field, t)} · ${sortOrderLabel(sort, t)}`,
        clear: () => setSort(DEFAULT_HOME_SORT),
      });
    }

    return chips;
  }, [favoritesOnly, source, type, sort, t]);

  const refineCount = useMemo(
    () =>
      (source !== "all" ? 1 : 0) +
      (type !== "all" ? 1 : 0) +
      (isDefaultSort(sort) ? 0 : 1),
    [source, type, sort],
  );

  return {
    searchTerm,
    setSearchTerm,
    favoritesOnly,
    setFavoritesOnly,
    toggleFavoritesOnly,
    source,
    setSource,
    type,
    setType,
    sort,
    setSort,
    setSortField,
    setSortOrder,
    resetAll,
    activeRefinements,
    refineCount,
  };
}
