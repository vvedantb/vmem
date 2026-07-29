import { useDeferredValue, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { getGraphSettings, setGraphSettings } from "@/lib/graph-cookies";
import { useGraphData } from "@/hooks/useGraphData";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import { buildGraphData, getGraphFacets } from "@/lib/graph/graph-data";
import type { GraphSettings } from "@/lib/graph/graph-types";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import type { ListItemKind } from "@/lib/list-items";
import type { MemoryType } from "@/lib/memories";
import { graphNodeMatchesLocalSearch } from "@/lib/graph/graph-search";
import {
  CLEARED_MEMORY_VIEW_FILTERS,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";

const EMPTY_SET = new Set<string>();

// caps load more at roughly twenty pages of five k nodes
const GLOBAL_GRAPH_MAX_NODES = 100_000;

export function useMemoryGraphController({
  focusNodeId,
  enabled = true,
}: {
  focusNodeId: string | null;
  // skip fetch while list view is active but stay mounted
  enabled?: boolean;
}) {
  const { isDark } = useThemeContext();

  const [params, setParams] = useMemoriesSearchParams();
  const activeProfileId = useActiveProfile()._id;

  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  const {
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    apiMentionsEdges,
    resolvedFocusNodeId,
    isFocused,
    totalMemoryCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
  } = useGraphData(focusNodeId, activeProfileId, enabled, params.bench);

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

  // display prefs live in cookies because they are not shareable URL state
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);

  const filters: MemoryViewFilterParams = {
    kinds: params.kinds,
    tags: params.tags,
    sources: params.sources,
    types: params.types,
  };

  const viewTheme = getViewTheme(isDark);

  const {
    tags: allTags,
    kinds: allKinds,
    sources: allSources,
    types: allTypes,
  } = getGraphFacets(apiNodes);

  // memo isolates graph build from theme/search so canvas identity stays stable.
  // without it GraphCanvas remounts WebGL and resets camera on every keystroke.
  const { graphNodes, graphEdges } = useMemo(
    () =>
      buildGraphData(
        apiNodes,
        apiTagEdges,
        allRelatesToEdges,
        apiWikiParentEdges,
        apiMentionsEdges,
        {
          kinds: params.kinds,
          tags: params.tags,
          sources: params.sources,
          types: params.types,
        },
      ),
    [
      apiNodes,
      apiTagEdges,
      allRelatesToEdges,
      apiWikiParentEdges,
      apiMentionsEdges,
      params.kinds,
      params.tags,
      params.sources,
      params.types,
    ],
  );

  const searchMatchSet = (() => {
    if (!isSearchActive) return EMPTY_SET;

    const matches = new Set<string>();
    const visibleNodeIds = new Set<string>();

    for (const node of graphNodes) {
      visibleNodeIds.add(node.id);
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
  })();

  const loadedMemoryCount = apiNodes.filter((n) => n.kind === "memory").length;

  const loadedRelationshipCount =
    apiTagEdges.length +
    allRelatesToEdges.length +
    apiWikiParentEdges.length +
    apiMentionsEdges.length;

  const canLoadMore =
    !isFocused && hasNextPage && loadedMemoryCount < GLOBAL_GRAPH_MAX_NODES;

  return {
    apiNodes,
    isLoading,
    isError,
    error,

    isFocused,
    resolvedFocusNodeId,

    loadedMemoryCount,
    loadedRelationshipCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore: isFetchingNextPage,
    fetchNextPage,

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
    filters,

    graphSettings,
    viewTheme,
    isDark,

    search: params.q,

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
  };
}

export type MemoryGraphController = ReturnType<typeof useMemoryGraphController>;
