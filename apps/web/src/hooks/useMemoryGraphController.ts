// non-canvas graph state (filters/search/display) shared by canvas + header

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { getGraphSettings, setGraphSettings } from "@/lib/graph-cookies";
import { useGraphData } from "@/hooks/useGraphData";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import type { GraphScope } from "@/lib/url-state/memories";
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
} from "@/lib/graph/graph-data";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";
import type { ListItemKind } from "@/lib/list-items";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "@/lib/graph/graph-types";
import {
  getViewTheme,
  type GraphViewTheme,
} from "@/components/_components/graph-view-themes";
import type { MemoryType } from "@/lib/memories";
import { graphNodeMatchesLocalSearch } from "@/lib/graph/graph-search";
import {
  CLEARED_MEMORY_VIEW_FILTERS,
  countActiveMemoryViewFilters,
  hasActiveMemoryViewFilters,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";

const EMPTY_SET = new Set<string>();

// cap global graph nodes (~20 load-more pages at 5k each)
const GLOBAL_GRAPH_MAX_NODES = 100_000;

export interface MemoryGraphController {
  // raw data
  apiNodes: ApiGraphNode[];
  apiTagEdges: ApiTagEdge[];
  allRelatesToEdges: ApiRelatesToEdge[];
  apiWikiParentEdges: ApiWikiParentEdge[];
  apiMentionsEdges: ApiMentionsEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;

  // scope (url)
  // local = focus neighbourhood; global = full capped graph
  scope: GraphScope;
  // focus centre for local graph; null in global
  resolvedFocusNodeId: string | null;

  // progressive global loading
  loadedMemoryCount: number;
  // total active memories; null until first response
  totalMemoryCount: number | null;
  canLoadMore: boolean;
  // true while fetching next page (previous stays on screen)
  isLoadingMore: boolean;
  onLoadMore: () => void;

  // derived
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

  // display (cookie)
  graphSettings: GraphSettings;
  viewTheme: GraphViewTheme;
  isDark: boolean;

  // search (url)
  search: string;

  // filter handlers (same shape as list view)
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
  // false = stay mounted but skip fetch (list view active)
  enabled?: boolean;
}): MemoryGraphController {
  const { isDark } = useThemeContext();

  // url filters shared with list view
  const [params, setParams] = useMemoriesSearchParams();
  const activeProfileId = useActiveProfile()._id;

  const listMemoriesAction = useAction(api.memoryApi.listMemories);

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

  // cookie-backed display state (per-user, non-shareable)
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

  // derived display state
  const viewTheme = useMemo(() => getViewTheme(isDark), [isDark]);

  // derived filter stats
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
    // raw
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    apiMentionsEdges,
    isLoading,
    isError,
    error,

    // scope
    scope,
    resolvedFocusNodeId,

    // progressive global loading
    loadedMemoryCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore: isFetchingNextPage,
    onLoadMore,

    // derived
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

    // display state
    graphSettings,
    viewTheme,
    isDark,

    // search (URL — shared with list view via `q`)
    search: params.q,

    // handlers
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
