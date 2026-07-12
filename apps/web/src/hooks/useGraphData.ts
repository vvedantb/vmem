"use client";

/**
 * Extracted graph data-fetching hook.
 * Handles the Convex action query, Zod validation, and live relationship
 * events. The global graph is keyset-paged: pages ACCUMULATE client-side
 * (useInfiniteQuery), so loading 100k memories transfers each page exactly
 * once — the old approach refetched the whole prefix on every "load more",
 * which made deep loading quadratic in transfer.
 */
import { useState, useMemo, useCallback } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { api } from "@vmem/backend";
import { generateBenchGraph } from "@/components/_components/bench-data";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
  ApiWikiParentEdge,
  ApiMentionsEdge,
} from "@/components/_components/graph-data";

// ---- Page sizes ----

/** First page stays small so the graph paints fast on entry. */
const FIRST_PAGE_SIZE = 500;
/** Follow-up pages bulk-load (server caps a page at 5000). */
const NEXT_PAGE_SIZE = 5000;

// Stable empty-array identities for loading/bench states. Inline `[]` here
// would mint a fresh identity per render, invalidating buildGraphData's memo
// downstream — whose output feeds GraphCanvas's [nodes, edges] effect, which
// tears down and rebuilds the entire physics simulation on identity change.
const EMPTY_NODES: ApiGraphNode[] = [];
const EMPTY_TAG_EDGES: ApiTagEdge[] = [];
const EMPTY_WIKI_PARENT_EDGES: ApiWikiParentEdge[] = [];
const EMPTY_MENTIONS_EDGES: ApiMentionsEdge[] = [];
const NOOP = () => {};

// ---- Zod schemas ----

const graphNodeKindSchema = z.enum([
  "memory",
  "wiki-document",
  "wiki-folder",
  "skill",
  "entity",
]);

const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  // Inline content is only present for wiki documents and skills; memory
  // nodes omit it (lazy-fetched via graphApi.getNodeContent on hover/click).
  content: z.string().optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  kind: graphNodeKindSchema,
  source: z.string().optional(),
  sourceType: z.string().nullable(),
  type: z.enum(["profile", "episodic", "knowledge"]).optional(),
  entityType: z.string().optional(),
});

const relatesToEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  reason: z.string(),
  score: z.number().optional(),
});

const tagEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  weight: z.number(),
  sharedTags: z.array(z.string()),
});

const wikiParentEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

const mentionsEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  relatesToEdges: z.array(relatesToEdgeSchema),
  tagEdges: z.array(tagEdgeSchema),
  wikiParentEdges: z.array(wikiParentEdgeSchema),
  mentionsEdges: z.array(mentionsEdgeSchema),
  // Local mode only: the memory the graph is centred on, resolved server-side
  // (newest memory) when no explicit focus was requested.
  focusNodeId: z.string().optional(),
  // Global mode, first page only: total active memories, for "Showing X of Y".
  totalMemoryCount: z.number().optional(),
  // Global mode: keyset cursor for the next page; absent when exhausted.
  nextCursorCreatedAt: z.string().optional(),
  nextCursorId: z.string().optional(),
});

type GraphResponse = z.infer<typeof graphResponseSchema>;

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

/**
 * Flattens accumulated pages into one graph:
 *  - nodes dedupe by id (entity nodes recur on every page that mentions them)
 *  - relates_to edges dedupe by pair (a cross-page edge is fetched from both
 *    of its endpoints' pages)
 *  - tag edges, wiki nodes/edges, focus, and total only exist on page one
 */
function mergePages(pages: GraphResponse[]): MergedGraph {
  const first = pages[0];
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

export interface UseGraphDataReturn {
  apiNodes: ApiGraphNode[];
  apiTagEdges: ApiTagEdge[];
  allRelatesToEdges: ApiRelatesToEdge[];
  apiWikiParentEdges: ApiWikiParentEdge[];
  apiMentionsEdges: ApiMentionsEdge[];
  /**
   * The memory the local graph is centred on — the explicit focus, or the
   * newest memory when the server picked the default. null in global scope.
   */
  resolvedFocusNodeId: string | null;
  /** Total active memories (global scope) — null until the first response. */
  totalMemoryCount: number | null;
  isLoading: boolean;
  /** True while a refetch is in flight over previous data. */
  isFetching: boolean;
  /** True while the next page is loading (existing pages stay on screen). */
  isFetchingNextPage: boolean;
  /** True when the server has more pages beyond what's accumulated. */
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isError: boolean;
  error: Error | null;
}

export function useGraphData(
  focusNodeId: string | null,
  profileId: string | null = null,
  enabled: boolean = true,
  scope: "local" | "global" = "global",
  depth: number = 2,
  /** `?bench=N` — synthetic client-side dataset, no server fetch. 0 = off. */
  benchCount: number = 0,
): UseGraphDataReturn {
  const { isAuthenticated } = useConvexAuth();
  const getGraphData = useAction(api.graphApi.getGraphData);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const benchData = useMemo(
    () => (benchCount > 0 ? generateBenchGraph(benchCount) : null),
    [benchCount],
  );

  const graphQuery = useInfiniteQuery({
    queryKey: [
      "graph",
      scope,
      focusNodeId ?? "auto",
      profileId ?? "all",
      scope === "local" ? depth : 0,
    ],
    // Scope/filter switches: keep showing the previous graph while the new
    // first page fetches instead of flashing the spinner.
    placeholderData: keepPreviousData,
    initialPageParam: null as GraphCursor | null,
    queryFn: async ({ pageParam }): Promise<GraphResponse> => {
      const result = await getGraphData({
        focus: scope === "local" ? (focusNodeId ?? undefined) : undefined,
        profileId: profileId ?? undefined,
        mode: scope,
        depth: scope === "local" ? depth : undefined,
        nodeLimit:
          scope === "global"
            ? pageParam
              ? NEXT_PAGE_SIZE
              : FIRST_PAGE_SIZE
            : undefined,
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
      });
      return graphResponseSchema.parse(result);
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
  }, [graphQuery.fetchNextPage]);

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
      isFetching: false,
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
    isFetching: graphQuery.isFetching,
    isFetchingNextPage: graphQuery.isFetchingNextPage,
    hasNextPage: graphQuery.hasNextPage,
    fetchNextPage,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
