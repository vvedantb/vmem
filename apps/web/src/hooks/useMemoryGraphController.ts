// non-canvas graph state (filters/search/display) shared by canvas + header

import { useDeferredValue, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { getGraphSettings, setGraphSettings } from "@/lib/graph-cookies";
import { useGraphData } from "@/hooks/useGraphData";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import type { GraphScope } from "@/lib/url-state/memories";
import { buildGraphData, getGraphFacets } from "@/lib/graph/graph-data";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "@/lib/graph/graph-types";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import type { ListItemKind } from "@/lib/list-items";
import type { MemoryType } from "@/lib/memories";
import { graphNodeMatchesLocalSearch } from "@/lib/graph/graph-search";
import {
  CLEARED_MEMORY_VIEW_FILTERS,
  hasActiveMemoryViewFilters,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";

const EMPTY_SET = new Set<string>();

// cap global graph nodes (~20 load-more pages at 5k each)
const GLOBAL_GRAPH_MAX_NODES = 100_000;

export function useMemoryGraphController({
  focusNodeId,
  enabled = true,
}: {
  focusNodeId: string | null;
  // false = stay mounted but skip fetch (list view active)
  enabled?: boolean;
}) {
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

  // derived display state
  const viewTheme = useMemo(() => getViewTheme(isDark), [isDark]);

  // derived filter stats
  const {
    tags: allTags,
    kinds: allKinds,
    sources: allSources,
    types: allTypes,
  } = useMemo(() => getGraphFacets(apiNodes), [apiNodes]);

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

  return {
    // raw (nodes only — edges stay internal to buildGraphData)
    apiNodes,
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

    // display state
    graphSettings,
    viewTheme,
    isDark,

    // search (URL — shared with list view via `q`)
    search: params.q,

    // handlers
    onKindsChange: (kinds: ListItemKind[]) => {
      void setParams({ kinds });
    },
    onTagsChange: (tags: string[]) => {
      void setParams({ tags });
    },
    onSourcesChange: (sources: string[]) => {
      void setParams({ sources });
    },
    onTypesChange: (types: MemoryType[]) => {
      void setParams({ types });
    },
    onClearFilters: () => {
      void setParams(CLEARED_MEMORY_VIEW_FILTERS);
    },
    onSettingsChange: (next: GraphSettings) => {
      setGraphSettingsState(next);
      setGraphSettings(next);
    },
    onSearchChange: (q: string) => {
      void setParams({ q: q.trim().length === 0 ? null : q });
    },
    onResetSettings: () => {
      setGraphSettingsState(DEFAULT_GRAPH_SETTINGS);
      setGraphSettings(DEFAULT_GRAPH_SETTINGS);
    },
  };
}

export type MemoryGraphController = ReturnType<typeof useMemoryGraphController>;
