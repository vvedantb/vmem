// extracted graph data-fetching hook
import { useState, useMemo } from "react";
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

const INITIAL_GRAPH_CURSOR: GraphCursor | null = null;

// ---- Page merging ----

interface MergedGraph {
  nodes: ApiGraphNode[];
  tagEdges: ApiTagEdge[];
  relatesToEdges: ApiRelatesToEdge[];
  wikiParentEdges: ApiWikiParentEdge[];
  mentionsEdges: ApiMentionsEdge[];
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
      totalMemoryCount: null,
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
    totalMemoryCount: first.totalMemoryCount ?? null,
  };
}

// ---- Hook ----

export function useGraphData(
  profileId: string | null = null,
  enabled: boolean = true,
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
    readonly ["graph", "global", string],
    GraphCursor | null
  >({
    queryKey: ["graph", "global", profileId ?? "all"],
    // keep the previous graph while paging, but not when switching workspaces
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] !== (profileId ?? "all")) {
        return undefined;
      }
      return previousData;
    },
    initialPageParam: INITIAL_GRAPH_CURSOR,
    queryFn: async ({ pageParam }): Promise<GraphResponse> => {
      return await getGraphData({
        profileId: profileId ?? undefined,
        mode: "global",
        nodeLimit: pageParam ? NEXT_PAGE_SIZE : FIRST_PAGE_SIZE,
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
      });
    },
    getNextPageParam: (lastPage): GraphCursor | undefined =>
      lastPage.nextCursorCreatedAt !== undefined &&
      lastPage.nextCursorId !== undefined
        ? { createdAt: lastPage.nextCursorCreatedAt, id: lastPage.nextCursorId }
        : undefined,
    enabled: isAuthenticated && enabled && benchData === null,
    staleTime: 30_000,
  });

  useMemoryEvents((event) => {
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
  });

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

  if (benchData) {
    return {
      apiNodes: benchData.nodes,
      apiTagEdges: benchData.tagEdges,
      allRelatesToEdges,
      apiWikiParentEdges: EMPTY_WIKI_PARENT_EDGES,
      apiMentionsEdges: EMPTY_MENTIONS_EDGES,
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
    totalMemoryCount: merged?.totalMemoryCount ?? null,
    isLoading: graphQuery.isLoading,
    isFetchingNextPage: graphQuery.isFetchingNextPage,
    hasNextPage: graphQuery.hasNextPage,
    fetchNextPage: () => {
      void graphQuery.fetchNextPage();
    },
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
