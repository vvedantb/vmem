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
 *   - Filters + search (tags/kinds/sources/types/q): URL via `nuqs`, shared with list view.
 *   - Display (forces/labels): cookies via `graph-cookies`, per-user.
 *   - Data: Convex action via `useGraphData`.
 */

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { getGraphSettings, setGraphSettings } from "@/lib/graph-cookies";
import { useGraphData } from "@/hooks/useGraphData";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useMemoriesSearchParams } from "@/routes/_main/$profileId/memories/useMemoriesSearchParams";
import type { GraphScope } from "@/routes/_main/$profileId/memories/-searchParams";
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
} from "@/components/_components/graph-view-themes";
import type { MemoryType } from "@/lib/memories";
import { graphNodeMatchesLocalSearch } from "@/components/_components/graph-search";
import {
  CLEARED_MEMORY_VIEW_FILTERS,
  countActiveMemoryViewFilters,
  hasActiveMemoryViewFilters,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";

const EMPTY_SET = new Set<string>();

/**
 * Client-side ceiling on accumulated global-graph nodes. Pages are 5000
 * each (server cap per response), so this is 20 "Load more" clicks — the
 * renderer and simulation are tuned to stay smooth at this scale.
 */
const GLOBAL_GRAPH_MAX_NODES = 100_000;

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

  // ----- Scope (URL) -----
  /** "local" = focus neighbourhood (default), "global" = full capped graph. */
  scope: GraphScope;
  /** Focus the local graph is centred on (server-resolved). null in global. */
  resolvedFocusNodeId: string | null;

  // ----- Progressive global loading -----
  /** Memory nodes currently loaded (global scope). */
  loadedMemoryCount: number;
  /** Total active memories on the server — null until the first response. */
  totalMemoryCount: number | null;
  /** True when more memories exist beyond the loaded page (and the cap). */
  canLoadMore: boolean;
  /** True while a bigger page is fetching (previous page stays on screen). */
  isLoadingMore: boolean;
  onLoadMore: () => void;

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
  filters: MemoryViewFilterParams;
  activeFilterCount: number;

  // ----- Display state (cookie) -----
  graphSettings: GraphSettings;
  viewTheme: GraphViewTheme;
  isDark: boolean;

  // ----- Search state (URL) -----
  search: string;

  // ----- Filter handlers (same shape as list view) -----
  onKindsChange: (kinds: ListItemKind[]) => void;
  onTagsChange: (tags: string[]) => void;
  onSourcesChange: (sources: string[]) => void;
  onTypesChange: (types: MemoryType[]) => void;
  onClearFilters: () => void;
  onSettingsChange: (next: GraphSettings) => void;
  onSearchChange: (q: string) => void;
  onResetSettings: () => void;
}

export function useMemoryGraphController({
  focusNodeId,
  enabled = true,
}: {
  focusNodeId: string | null;
  /**
   * When false the controller stays mounted (so the graph route never loses
   * its context during a tab transition) but skips all data fetching. Set to
   * false while the list view is active so we don't fetch graph data for a
   * view that never reads it.
   */
  enabled?: boolean;
}): MemoryGraphController {
  const { theme } = useThemeContext();

  // URL-backed filter state — shared with list view so filters persist across
  // view modes and are URL-shareable.
  const [params, setParams] = useMemoriesSearchParams();
  const activeProfileId = useActiveProfile()._id;

  // Data
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  // Scope lives in the URL beside the focus id.
  const scope: GraphScope = params.scope;

  const {
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    apiMentionsEdges,
    resolvedFocusNodeId,
    totalMemoryCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
  } = useGraphData(focusNodeId, activeProfileId, enabled, scope, params.bench);

  const searchQuery = params.q.trim();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchActive = searchQuery.length > 0;

  const { data: memorySearchResult } = useTanstackQuery({
    queryKey: ["graph-memory-search", deferredSearchQuery, activeProfileId],
    queryFn: () =>
      listMemoriesAction({
        searchQuery: deferredSearchQuery,
        profileId: activeProfileId,
        limit: 500,
        offset: 0,
      }),
    enabled: enabled && deferredSearchQuery.length > 0,
    staleTime: 30_000,
  });

  // Cookie-backed display state (per-user, non-shareable).
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);

  const filters = useMemo<MemoryViewFilterParams>(
    () => ({
      kinds: params.kinds,
      tags: params.tags,
      sources: params.sources,
      types: params.types,
    }),
    [params.kinds, params.tags, params.sources, params.types],
  );

  const activeFilterCount = useMemo(
    () => countActiveMemoryViewFilters(filters),
    [filters],
  );

  // Derived display state
  const isDark = theme === "dark";
  const viewTheme = useMemo(() => getViewTheme(isDark), [isDark]);

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
        filters,
      ),
    [
      apiNodes,
      apiTagEdges,
      allRelatesToEdges,
      apiWikiParentEdges,
      apiMentionsEdges,
      filters,
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

  const hasActiveFilters = hasActiveMemoryViewFilters(filters);

  // ----- Progressive global loading -----

  const loadedMemoryCount = useMemo(
    () => apiNodes.filter((n) => n.kind === "memory").length,
    [apiNodes],
  );

  const canLoadMore =
    scope === "global" &&
    hasNextPage &&
    loadedMemoryCount < GLOBAL_GRAPH_MAX_NODES;

  const onLoadMore = fetchNextPage;

  // ----- Handlers -----

  const onSettingsChange = useCallback((next: GraphSettings) => {
    setGraphSettingsState(next);
    setGraphSettings(next);
  }, []);

  const onResetSettings = useCallback(() => {
    setGraphSettingsState(DEFAULT_GRAPH_SETTINGS);
    setGraphSettings(DEFAULT_GRAPH_SETTINGS);
  }, []);

  const onKindsChange = useCallback(
    (kinds: ListItemKind[]) => {
      void setParams({ kinds });
    },
    [setParams],
  );

  const onTagsChange = useCallback(
    (tags: string[]) => {
      void setParams({ tags });
    },
    [setParams],
  );

  const onSourcesChange = useCallback(
    (sources: string[]) => {
      void setParams({ sources });
    },
    [setParams],
  );

  const onTypesChange = useCallback(
    (types: MemoryType[]) => {
      void setParams({ types });
    },
    [setParams],
  );

  const onClearFilters = useCallback(() => {
    void setParams(CLEARED_MEMORY_VIEW_FILTERS);
  }, [setParams]);

  const onSearchChange = useCallback(
    (q: string) => {
      void setParams({ q: q.trim().length === 0 ? null : q });
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

    // Scope
    scope,
    resolvedFocusNodeId,

    // Progressive global loading
    loadedMemoryCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore: isFetchingNextPage,
    onLoadMore,

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
    filters,
    activeFilterCount,

    // Display state
    graphSettings,
    viewTheme,
    isDark,

    // Search (URL — shared with list view via `q`)
    search: params.q,

    // Handlers
    onKindsChange,
    onTagsChange,
    onSourcesChange,
    onTypesChange,
    onClearFilters,
    onSettingsChange,
    onSearchChange,
    onResetSettings,
  };
}
