"use client";

/**
 * Graph-view controller hook.
 *
 * Owns everything the graph view needs that is NOT purely canvas-local
 * (selected/hovered nodes stay in the canvas component). Centralizing here
 * lets both the canvas (`MemoryGraph`) and the header popovers
 * (`GraphHeaderControls`) read from one source — no prop drilling, no extra
 * React context, no duplicated state/data-fetching.
 *
 * State ownership:
 *   - Filters + search (profile/tags/kinds/sources/types/q): URL via `nuqs`, shared with list view.
 *   - Display (view mode, forces/labels): cookies via `graph-cookies`, per-user.
 *   - Data: Convex action via `useGraphData`.
 */

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { api } from "@vmem/backend";
import {
  getGraphSettings,
  setGraphSettings,
  getGraphViewMode,
  setGraphViewMode,
} from "@/lib/graph-cookies";
import { useGraphData } from "@/hooks/useGraphData";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { memoriesSearchParams } from "@/routes/_main/memories/-searchParams";
import {
  buildGraphData,
  getAllTags,
  getAllKinds,
  getAllSources,
  getAllTypes,
  type ApiGraphNode,
  type ApiTagEdge,
  type ApiRelatesToEdge,
  type ApiWikiParentEdge,
  type ApiMentionsEdge,
  type TagStat,
  type KindStat,
  type SourceStat,
  type TypeStat,
} from "@/components/_components/graph-data";
import type {
  GraphNode,
  GraphEdge,
} from "@/components/_components/canvas/types";
import type { ListItemKind } from "@/lib/list-items";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "@/components/_components/graph-types";
import {
  getViewTheme,
  type GraphViewTheme,
  type ViewMode,
} from "@/components/_components/graph-view-themes";
import type { MemoryType } from "@/lib/memories";
import { graphNodeMatchesLocalSearch } from "@/components/_components/graph-search";

const EMPTY_SET = new Set<string>();

/**
 * Default kind filter shows every known kind. We seed the set with all four
 * (rather than only present kinds) so a user's first wiki doc, folder, or
 * skill appears automatically without them having to re-enable the filter.
 */
const DEFAULT_ACTIVE_KINDS: ReadonlySet<ListItemKind> = new Set<ListItemKind>([
  "memory",
  "entity",
  "wiki-document",
  "wiki-folder",
  "skill",
]);

export interface MemoryGraphController {
  // ----- Raw data -----
  apiNodes: ApiGraphNode[];
  apiTagEdges: ApiTagEdge[];
  allRelatesToEdges: ApiRelatesToEdge[];
  apiWikiParentEdges: ApiWikiParentEdge[];
  apiMentionsEdges: ApiMentionsEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;

  // ----- Derived -----
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  searchMatchSet: Set<string>;
  isSearchActive: boolean;
  allTags: TagStat[];
  allKinds: KindStat[];
  allSources: SourceStat[];
  allTypes: TypeStat[];
  totalNodeCount: number;
  visibleNodeCount: number;
  edgeCount: number;
  hasActiveFilters: boolean;

  // ----- Filter state (URL) -----
  profileId: string | null;
  activeTags: Set<string>;
  activeKinds: Set<ListItemKind>;
  activeSources: Set<string>;
  activeTypes: Set<MemoryType>;

  // ----- Display state (cookie) -----
  graphSettings: GraphSettings;
  viewMode: ViewMode;
  viewTheme: GraphViewTheme;
  isDark: boolean;

  // ----- Search state (URL) -----
  search: string;

  // ----- Handlers -----
  onProfileChange: (id: string | null) => void;
  onToggleTag: (tag: string) => void;
  onToggleKind: (kind: ListItemKind) => void;
  onToggleSource: (source: string) => void;
  onToggleType: (type: MemoryType) => void;
  /** Reset every URL-backed filter in a single `setParams` write. */
  onClearFilters: () => void;
  onSettingsChange: (next: GraphSettings) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (q: string) => void;
  onResetSettings: () => void;
}

export function useMemoryGraphController({
  focusNodeId,
}: {
  focusNodeId: string | null;
}): MemoryGraphController {
  const { theme } = useThemeContext();

  // URL-backed filter state — shared with list view so filters persist across
  // view modes and are URL-shareable.
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  // Data
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  const {
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    apiMentionsEdges,
    isLoading,
    isError,
    error,
  } = useGraphData(focusNodeId, params.profile);

  const searchQuery = params.q.trim();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchActive = searchQuery.length > 0;

  const { data: memorySearchResult } = useTanstackQuery({
    queryKey: [
      "graph-memory-search",
      deferredSearchQuery,
      params.profile ?? "",
    ],
    queryFn: () =>
      listMemoriesAction({
        searchQuery: deferredSearchQuery,
        profileId: params.profile ?? undefined,
        limit: 500,
        offset: 0,
      }),
    enabled: deferredSearchQuery.length > 0,
    staleTime: 30_000,
  });

  // Cookie-backed display state (per-user, non-shareable).
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);
  const [viewMode, setViewModeState] = useState<ViewMode>(getGraphViewMode);

  // Adapt nuqs arrays ↔ Sets once; buildGraphData and downstream handlers use
  // Set semantics. An empty `kinds` array means "all kinds visible" so a
  // fresh URL shows everything by default.
  const activeTags = useMemo(() => new Set(params.tags), [params.tags]);
  const activeKinds = useMemo<Set<ListItemKind>>(
    () =>
      params.kinds.length > 0
        ? new Set(params.kinds)
        : new Set(DEFAULT_ACTIVE_KINDS),
    [params.kinds],
  );
  const activeSources = useMemo(
    () => new Set(params.sources),
    [params.sources],
  );
  const activeTypes = useMemo<Set<MemoryType>>(
    () => new Set(params.types),
    [params.types],
  );

  // Derived display state
  const isDark = theme === "dark";
  const viewTheme = useMemo(
    () => getViewTheme(viewMode, isDark),
    [viewMode, isDark],
  );

  // Derived filter stats
  const allTags = useMemo(() => getAllTags(apiNodes), [apiNodes]);
  const allKinds = useMemo(() => getAllKinds(apiNodes), [apiNodes]);
  const allSources = useMemo(() => getAllSources(apiNodes), [apiNodes]);
  const allTypes = useMemo(() => getAllTypes(apiNodes), [apiNodes]);

  const { graphNodes, graphEdges } = useMemo(
    () =>
      buildGraphData(
        apiNodes,
        apiTagEdges,
        allRelatesToEdges,
        apiWikiParentEdges,
        apiMentionsEdges,
        activeTags,
        activeKinds,
        activeSources,
        activeTypes,
      ),
    [
      apiNodes,
      apiTagEdges,
      allRelatesToEdges,
      apiWikiParentEdges,
      apiMentionsEdges,
      activeTags,
      activeKinds,
      activeSources,
      activeTypes,
    ],
  );

  const visibleNodeIds = useMemo(
    () => new Set(graphNodes.map((node) => node.id)),
    [graphNodes],
  );

  const searchMatchSet = useMemo(() => {
    if (!isSearchActive) return EMPTY_SET;

    const matches = new Set<string>();

    for (const node of graphNodes) {
      if (graphNodeMatchesLocalSearch(node, searchQuery)) {
        matches.add(node.id);
      }
    }

    const memories = memorySearchResult?.memories;
    if (memories) {
      for (const memory of memories) {
        if (visibleNodeIds.has(memory.id)) {
          matches.add(memory.id);
        }
      }
    }

    return matches;
  }, [
    isSearchActive,
    searchQuery,
    graphNodes,
    memorySearchResult,
    visibleNodeIds,
  ]);

  // A "badge" on the Filters button — true when any URL-backed filter is
  // narrowing results (profile/tags/sources/types, or kinds is a non-default subset).
  const hasActiveFilters =
    params.profile !== null ||
    params.tags.length > 0 ||
    params.sources.length > 0 ||
    params.types.length > 0 ||
    (params.kinds.length > 0 &&
      params.kinds.length < DEFAULT_ACTIVE_KINDS.size);

  // ----- Handlers -----

  const onSettingsChange = useCallback((next: GraphSettings) => {
    setGraphSettingsState(next);
    setGraphSettings(next);
  }, []);

  const onViewModeChange = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setGraphViewMode(mode);
  }, []);

  const onResetSettings = useCallback(() => {
    setGraphSettingsState(DEFAULT_GRAPH_SETTINGS);
    setGraphSettings(DEFAULT_GRAPH_SETTINGS);
  }, []);

  const onToggleTag = useCallback(
    (tag: string) => {
      const next = params.tags.includes(tag)
        ? params.tags.filter((t) => t !== tag)
        : [...params.tags, tag];
      void setParams({ tags: next });
    },
    [params.tags, setParams],
  );

  // Kind filter stays aligned with list-view semantics: an empty `kinds` array
  // in the URL means "all kinds visible" (handled at read time via the
  // activeKinds memo). Toggling off every kind results in an empty array,
  // which widens back to "show all" — matches how nuqs filters work elsewhere.
  const onToggleKind = useCallback(
    (kind: ListItemKind) => {
      const current =
        params.kinds.length > 0
          ? params.kinds
          : Array.from(DEFAULT_ACTIVE_KINDS);
      const next = current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind];
      void setParams({ kinds: next });
    },
    [params.kinds, setParams],
  );

  const onToggleSource = useCallback(
    (source: string) => {
      const next = params.sources.includes(source)
        ? params.sources.filter((s) => s !== source)
        : [...params.sources, source];
      void setParams({ sources: next });
    },
    [params.sources, setParams],
  );

  const onToggleType = useCallback(
    (type: MemoryType) => {
      const next = params.types.includes(type)
        ? params.types.filter((t) => t !== type)
        : [...params.types, type];
      void setParams({ types: next });
    },
    [params.types, setParams],
  );

  const onProfileChange = useCallback(
    (profile: string | null) => {
      void setParams({ profile });
    },
    [setParams],
  );

  // Clearing per-field via the individual toggle callbacks would race — each
  // toggle reads `params.*` from a stale closure, so successive setParams calls
  // throttle to a single URL write that only reflects the last toggle. Writing
  // every filter in one setParams call sidesteps the race entirely.
  const onClearFilters = useCallback(() => {
    void setParams({
      profile: null,
      kinds: [],
      tags: [],
      sources: [],
      types: [],
    });
  }, [setParams]);

  const onSearchChange = useCallback(
    (q: string) => {
      void setParams({ q });
    },
    [setParams],
  );

  return {
    // Raw
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    apiMentionsEdges,
    isLoading,
    isError,
    error,

    // Derived
    graphNodes,
    graphEdges,
    searchMatchSet,
    isSearchActive,
    allTags,
    allKinds,
    allSources,
    allTypes,
    totalNodeCount: apiNodes.length,
    visibleNodeCount: graphNodes.length,
    edgeCount: graphEdges.length,
    hasActiveFilters,

    // Filter state
    profileId: params.profile,
    activeTags,
    activeKinds,
    activeSources,
    activeTypes,

    // Display state
    graphSettings,
    viewMode,
    viewTheme,
    isDark,

    // Search (URL — shared with list view via `q`)
    search: params.q,

    // Handlers
    onProfileChange,
    onToggleTag,
    onToggleKind,
    onToggleSource,
    onToggleType,
    onClearFilters,
    onSettingsChange,
    onViewModeChange,
    onSearchChange,
    onResetSettings,
  };
}
