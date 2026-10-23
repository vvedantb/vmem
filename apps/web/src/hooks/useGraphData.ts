import { useState } from "react";
import {
  useConvexAuth,
  useAction,
  useQuery as useConvexQuery,
} from "convex/react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import { decodeGraphSnapshot } from "@vmem/shared";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { api } from "@vmem/backend";
import { generateBenchGraph } from "@/lib/graph/bench-data";
import { mergeSnapshotDelta } from "@/lib/graph/graph-snapshot";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
  ApiMentionsEdge,
  GraphResponse,
} from "@/lib/graph/graph-data";

// small first page so graph paints quickly on entry
const FIRST_PAGE_SIZE = 500;
// later pages bulk load up to server cap
const NEXT_PAGE_SIZE = 5000;
// depth when drilling into a focus-node neighbourhood
const FOCUS_GRAPH_DEPTH = 2;

// stable empty refs avoid useless rerenders while loading
const EMPTY_NODES: ApiGraphNode[] = [];
const EMPTY_TAG_EDGES: ApiTagEdge[] = [];
const EMPTY_MENTIONS_EDGES: ApiMentionsEdge[] = [];
const NOOP = () => {};

interface GraphCursor {
  createdAt: string;
  id: string;
}

const INITIAL_GRAPH_CURSOR: GraphCursor | null = null;

interface MergedGraph {
  nodes: ApiGraphNode[];
  tagEdges: ApiTagEdge[];
  relatesToEdges: ApiRelatesToEdge[];
  mentionsEdges: ApiMentionsEdge[];
  focusNodeId: string | null;
  totalMemoryCount: number | null;
}

function mergePages(pages: GraphResponse[]): MergedGraph {
  const first = pages.at(0);
  if (first === undefined) {
    return {
      nodes: EMPTY_NODES,
      tagEdges: EMPTY_TAG_EDGES,
      relatesToEdges: [],
      mentionsEdges: EMPTY_MENTIONS_EDGES,
      focusNodeId: null,
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
    mentionsEdges,
    focusNodeId: first.focusNodeId ?? null,
    totalMemoryCount: first.totalMemoryCount ?? null,
  };
}

// Precomputed graph of the global view: snapshot metadata (reactive), the
// body (fetched once per stored file, only while the view is open), the live
// delta since it was built, and the refresh control. With no snapshot yet it
// builds one once per profile and session; until then the live path runs.
function useGraphSnapshot(profileId: string | null, enabled: boolean) {
  const refreshGraphSnapshot = useAction(
    api.graphSnapshots.refreshGraphSnapshot,
  );
  const meta = useConvexQuery(
    api.graphSnapshots.getGraphSnapshot,
    enabled && profileId !== null ? { profileId } : "skip",
  );
  const snapshot = meta?.snapshot ?? null;

  const body = useQuery({
    queryKey: ["graph-snapshot", profileId ?? "none", snapshot?.storageId],
    enabled: snapshot !== null,
    staleTime: Infinity,
    // a rebuilt file keeps the old graph on screen until it is decoded
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === (profileId ?? "none")
        ? previousData
        : undefined,
    queryFn: async () => {
      if (snapshot === null) throw new Error("No graph snapshot");
      const response = await fetch(snapshot.url);
      if (!response.ok) {
        throw new Error(`Graph snapshot fetch failed (${response.status})`);
      }
      return decodeGraphSnapshot(await response.text());
    },
  });

  const delta = useConvexQuery(
    api.graphSnapshots.getGraphDelta,
    snapshot !== null && profileId !== null
      ? { profileId, since: snapshot.builtAt }
      : "skip",
  );

  const isMissing =
    profileId === null || (meta !== undefined && snapshot === null);
  useQuery({
    queryKey: ["graph-snapshot-build", profileId ?? "none"],
    enabled: enabled && isMissing && profileId !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () =>
      profileId === null ? null : await refreshGraphSnapshot({ profileId }),
  });

  const refresh = useMutation({
    mutationFn: async () =>
      profileId === null ? null : await refreshGraphSnapshot({ profileId }),
  });

  const graph =
    body.data === undefined ? null : mergeSnapshotDelta(body.data, delta);
  const refreshResult = refresh.data;

  return {
    // no snapshot to show: the caller falls back to the live path
    useLive: isMissing || body.isError,
    isLoading:
      enabled && (meta === undefined || (snapshot !== null && body.isPending)),
    graph,
    builtAt: snapshot?.builtAt ?? null,
    needsRefresh: delta?.needsRefresh === true || snapshot?.truncated === true,
    isRefreshing: refresh.isPending,
    refreshRetryAfterMs:
      refreshResult?.status === "rate_limited"
        ? refreshResult.retryAfterMs
        : null,
    refresh: () => {
      refresh.mutate();
    },
  };
}

export function useGraphData(
  focusNodeId: string | null,
  profileId: string | null = null,
  enabled: boolean = true,
  // bench query param skips server and uses synthetic data
  benchCount: number = 0,
) {
  const { isAuthenticated } = useConvexAuth();
  const getGraphData = useAction(api.graphApi.getGraphData);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const isFocused = focusNodeId !== null;
  const benchData = benchCount > 0 ? generateBenchGraph(benchCount) : null;
  const snapshot = useGraphSnapshot(
    profileId,
    isAuthenticated && enabled && !isFocused && benchData === null,
  );
  const snapshotGraph = isFocused || snapshot.useLive ? null : snapshot.graph;

  const graphQuery = useInfiniteQuery<
    GraphResponse,
    Error,
    InfiniteData<GraphResponse>,
    readonly ["graph", "focus" | "global", string, string],
    GraphCursor | null
  >({
    queryKey: [
      "graph",
      isFocused ? "focus" : "global",
      focusNodeId ?? "none",
      profileId ?? "all",
    ],
    // keep stale graph on focus-node change but clear when profile switches
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[3] !== (profileId ?? "all")) {
        return undefined;
      }
      return previousData;
    },
    initialPageParam: INITIAL_GRAPH_CURSOR,
    queryFn: async ({ pageParam }): Promise<GraphResponse> => {
      if (isFocused) {
        return await getGraphData({
          focus: focusNodeId,
          profileId: profileId ?? undefined,
          mode: "local",
          depth: FOCUS_GRAPH_DEPTH,
        });
      }
      return await getGraphData({
        profileId: profileId ?? undefined,
        mode: "global",
        nodeLimit: pageParam ? NEXT_PAGE_SIZE : FIRST_PAGE_SIZE,
        cursorCreatedAt: pageParam?.createdAt,
        cursorId: pageParam?.id,
      });
    },
    getNextPageParam: (lastPage): GraphCursor | undefined =>
      !isFocused &&
      lastPage.nextCursorCreatedAt !== undefined &&
      lastPage.nextCursorId !== undefined
        ? { createdAt: lastPage.nextCursorCreatedAt, id: lastPage.nextCursorId }
        : undefined,
    enabled:
      isAuthenticated &&
      enabled &&
      benchData === null &&
      (isFocused || snapshot.useLive),
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

  const pages = graphQuery.data?.pages;
  const merged = pages && pages.length > 0 ? mergePages(pages) : null;

  const allRelatesToEdges = benchData
    ? benchData.relatesToEdges
    : [
        ...(snapshotGraph?.relatesToEdges ?? merged?.relatesToEdges ?? []),
        ...liveRelatesToEdges,
      ];

  const snapshotStatus = {
    snapshotBuiltAt: snapshotGraph === null ? null : snapshot.builtAt,
    snapshotNeedsRefresh: snapshot.needsRefresh,
    isRefreshingSnapshot: snapshot.isRefreshing,
    snapshotRefreshRetryAfterMs: snapshot.refreshRetryAfterMs,
    refreshSnapshot: snapshot.refresh,
  };

  if (benchData) {
    return {
      apiNodes: benchData.nodes,
      apiTagEdges: benchData.tagEdges,
      allRelatesToEdges,
      apiMentionsEdges: EMPTY_MENTIONS_EDGES,
      resolvedFocusNodeId: null,
      isFocused: false,
      totalMemoryCount: benchData.nodes.length,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: NOOP,
      isError: false,
      error: null,
      ...snapshotStatus,
      snapshotBuiltAt: null,
    };
  }

  // a live graph already on screen stays until the snapshot body is decoded
  if (
    snapshotGraph !== null ||
    (!isFocused && !snapshot.useLive && merged === null)
  ) {
    return {
      apiNodes: snapshotGraph?.nodes ?? EMPTY_NODES,
      apiTagEdges: EMPTY_TAG_EDGES,
      allRelatesToEdges,
      apiMentionsEdges: snapshotGraph?.mentionsEdges ?? EMPTY_MENTIONS_EDGES,
      resolvedFocusNodeId: null,
      isFocused: false,
      totalMemoryCount:
        snapshotGraph?.nodes.filter((node) => node.kind === "memory").length ??
        null,
      isLoading: snapshot.isLoading,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: NOOP,
      isError: false,
      error: null,
      ...snapshotStatus,
    };
  }

  return {
    apiNodes: merged?.nodes ?? EMPTY_NODES,
    apiTagEdges: merged?.tagEdges ?? EMPTY_TAG_EDGES,
    allRelatesToEdges,
    apiMentionsEdges: merged?.mentionsEdges ?? EMPTY_MENTIONS_EDGES,
    resolvedFocusNodeId: merged?.focusNodeId ?? focusNodeId,
    isFocused,
    totalMemoryCount: merged?.totalMemoryCount ?? null,
    isLoading: graphQuery.isLoading,
    isFetchingNextPage: graphQuery.isFetchingNextPage,
    hasNextPage: graphQuery.hasNextPage,
    fetchNextPage: () => {
      void graphQuery.fetchNextPage();
    },
    isError: graphQuery.isError,
    error: graphQuery.error,
    ...snapshotStatus,
  };
}
