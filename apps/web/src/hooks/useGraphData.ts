// extracted graph data-fetching hook
import { useState, useMemo, useCallback } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { api } from "@vmem/backend";
import { generateBenchGraph } from "@/lib/graph/bench-data";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
  ApiWikiParentEdge,
  ApiMentionsEdge,
  GraphResponse,
} from "@/lib/graph/graph-data";

// ---- Page sizes ----

// first page stays small so the graph paints fast on entry
const FIRST_PAGE_SIZE = 500;
// follow-up pages bulk-load (server caps a page at 5000)
const NEXT_PAGE_SIZE = 5000;

// stable empty-array identities for loading/bench states
const EMPTY_NODES: ApiGraphNode[] = [];
const EMPTY_TAG_EDGES: ApiTagEdge[] = [];
const EMPTY_WIKI_PARENT_EDGES: ApiWikiParentEdge[] = [];
const EMPTY_MENTIONS_EDGES: ApiMentionsEdge[] = [];
const NOOP = () => {};

interface GraphCursor {
  createdAt: string;
  id: string;
}

// ---- Page merging ----

interface MergedGraph {
  nodes: ApiGraphNode[];
  tagEdges: ApiTagEdge[];
  relatesToEdges: ApiRelatesToEdge[];
  wikiParentEdges: ApiWikiParentEdge[];
  mentionsEdges: ApiMentionsEdge[];
  focusNodeId: string | null;
  totalMemoryCount: number | null;
}

// flattens accumulated pages into one graph:
function mergePages(pages: GraphResponse[]): MergedGraph {
  const first = pages.at(0);
  if (first === undefined) {
    return {
      nodes: EMPTY_NODES,
      tagEdges: EMPTY_TAG_EDGES,
      relatesToEdges: [],
      wikiParentEdges: EMPTY_WIKI_PARENT_EDGES,
      mentionsEdges: EMPTY_MENTIONS_EDGES,
      focusNodeId: null,
      totalMemoryCount: null,
    };
  }
  if (pages.length === 1) {
    return {
      nodes: first.nodes,
      tagEdges: first.tagEdges,
      relatesToEdges: first.relatesToEdges,
      wikiParentEdges: first.wikiParentEdges,
      mentionsEdges: first.mentionsEdges,
      focusNodeId: first.focusNodeId ?? null,
      totalMemoryCount: first.totalMemoryCount ?? null,
    };
  }

  const nodeById = new Map<string, ApiGraphNode>();
  const relatesToEdges: ApiRelatesToEdge[] = [];
  const seenPairs = new Set<string>();
  const mentionsEdges: ApiMentionsEdge[] = [];
  for (const page of pages) {
    for (const node of page.nodes) {
      if (!nodeById.has(node.id)) nodeById.set(node.id, node);
    }
    for (const edge of page.relatesToEdges) {
      const key = `${edge.source}|${edge.target}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      relatesToEdges.push(edge);
    }
    for (const edge of page.mentionsEdges) mentionsEdges.push(edge);
  }

  return {
    nodes: [...nodeById.values()],
    tagEdges: first.tagEdges,
    relatesToEdges,
    wikiParentEdges: first.wikiParentEdges,
    mentionsEdges,
    focusNodeId: first.focusNodeId ?? null,
    totalMemoryCount: first.totalMemoryCount ?? null,
  };
}

// ---- Hook ----

// fixed hop count for local (focus-neighbourhood) graph fetches
const LOCAL_GRAPH_DEPTH = 2;

export function useGraphData(
  focusNodeId: string | null,
  profileId: string | null = null,
  enabled: boolean = true,
  scope: "local" | "global" = "global",
  // `?bench=N` — synthetic client-side dataset, no server fetch
  benchCount: number = 0,
) {
  const { isAuthenticated } = useConvexAuth();
  const getGraphData = useAction(api.graphApi.getGraphData);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const benchData = useMemo(
    () => (benchCount > 0 ? generateBenchGraph(benchCount) : null),
    [benchCount],
  );

  const graphQuery = useInfiniteQuery<
    GraphResponse,
    Error,
    InfiniteData<GraphResponse>,
    readonly ["graph", "local" | "global", string, string],
    GraphCursor | null
  >({
    queryKey: ["graph", scope, focusNodeId ?? "auto", profileId ?? "all"],
    // keep the previous graph while scope/focus changes, but not when
    // switching workspaces — showing another profile's nodes is misleading
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[3] !== (profileId ?? "all")) {
        return undefined;
      }
      return previousData;
    },
    initialPageParam: null as GraphCursor | null,
    queryFn: async ({ pageParam }): Promise<GraphResponse> => {
      return await getGraphData({
        focus: scope === "local" ? (focusNodeId ?? undefined) : undefined,
        profileId: profileId ?? undefined,
        mode: scope,
        depth: scope === "local" ? LOCAL_GRAPH_DEPTH : undefined,
        nodeLimit:
          scope === "global"
            ? pageParam
              ? NEXT_PAGE_SIZE
              : FIRST_PAGE_SIZE
            : undefined,
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
      });
    },
    getNextPageParam: (lastPage): GraphCursor | undefined =>
      scope === "global" &&
      lastPage.nextCursorCreatedAt !== undefined &&
      lastPage.nextCursorId !== undefined
        ? { createdAt: lastPage.nextCursorCreatedAt, id: lastPage.nextCursorId }
        : undefined,
    enabled: isAuthenticated && enabled && benchData === null,
    staleTime: 30_000,
  });

  const handleRelationshipEvent = useCallback(
    (event: {
      eventType: "relationship_created" | "relationship_deleted";
      source: string;
      target: string;
      reason?: string;
    }) => {
      if (event.eventType === "relationship_created") {
        setLiveRelatesToEdges((prev) => [
          ...prev,
          {
            source: event.source,
            target: event.target,
            reason: event.reason ?? "linked",
          },
        ]);
      } else {
        setLiveRelatesToEdges((prev) =>
          prev.filter(
            (e) =>
              !(e.source === event.source && e.target === event.target) &&
              !(e.source === event.target && e.target === event.source),
          ),
        );
      }
    },
    [],
  );

  useMemoryEvents(handleRelationshipEvent);

  const merged = useMemo(() => {
    const pages = graphQuery.data?.pages;
    if (!pages || pages.length === 0) return null;
    return mergePages(pages);
  }, [graphQuery.data]);

  const allRelatesToEdges = useMemo(() => {
    if (benchData) return benchData.relatesToEdges;
    const apiEdges = merged?.relatesToEdges ?? [];
    return [...apiEdges, ...liveRelatesToEdges];
  }, [benchData, merged?.relatesToEdges, liveRelatesToEdges]);

  const fetchNextPage = useCallback(() => {
    void graphQuery.fetchNextPage();
  }, [graphQuery]);

  if (benchData) {
    return {
      apiNodes: benchData.nodes,
      apiTagEdges: benchData.tagEdges,
      allRelatesToEdges,
      apiWikiParentEdges: EMPTY_WIKI_PARENT_EDGES,
      apiMentionsEdges: EMPTY_MENTIONS_EDGES,
      resolvedFocusNodeId: null,
      totalMemoryCount: benchData.nodes.length,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: NOOP,
      isError: false,
      error: null,
    };
  }

  return {
    apiNodes: merged?.nodes ?? EMPTY_NODES,
    apiTagEdges: merged?.tagEdges ?? EMPTY_TAG_EDGES,
    allRelatesToEdges,
    apiWikiParentEdges: merged?.wikiParentEdges ?? EMPTY_WIKI_PARENT_EDGES,
    apiMentionsEdges: merged?.mentionsEdges ?? EMPTY_MENTIONS_EDGES,
    resolvedFocusNodeId: merged?.focusNodeId ?? null,
    totalMemoryCount: merged?.totalMemoryCount ?? null,
    isLoading: graphQuery.isLoading,
    isFetchingNextPage: graphQuery.isFetchingNextPage,
    hasNextPage: graphQuery.hasNextPage,
    fetchNextPage,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}

export type UseGraphDataReturn = ReturnType<typeof useGraphData>;
