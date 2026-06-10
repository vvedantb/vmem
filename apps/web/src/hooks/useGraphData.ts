"use client";

/**
 * Extracted graph data-fetching hook.
 * Handles Convex action query, Zod validation, and live relationship events.
 */
import { useState, useMemo, useCallback } from "react";
import { useConvexAuth, useAction } from "convex/react";
import {
  keepPreviousData,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import { z } from "zod";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { api } from "@vmem/backend";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
  ApiWikiParentEdge,
  ApiMentionsEdge,
} from "@/components/_components/graph-data";

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
  // Global mode only: total active memories, for "Showing X of Y".
  totalMemoryCount: z.number().optional(),
});

type GraphResponse = z.infer<typeof graphResponseSchema>;

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
  /** True while a refetch (e.g. load-more) is in flight over previous data. */
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

export function useGraphData(
  focusNodeId: string | null,
  profileId: string | null = null,
  enabled: boolean = true,
  scope: "local" | "global" = "global",
  depth: number = 2,
  nodeLimit: number = 2000,
): UseGraphDataReturn {
  const { isAuthenticated } = useConvexAuth();
  const getGraphData = useAction(api.graphApi.getGraphData);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const graphQuery = useTanstackQuery({
    queryKey: [
      "graph",
      scope,
      focusNodeId ?? "auto",
      profileId ?? "all",
      scope === "local" ? depth : 0,
      scope === "global" ? nodeLimit : 0,
    ],
    // Load-more bumps nodeLimit (new queryKey): keep showing the previous
    // page while the bigger one fetches instead of flashing the spinner.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GraphResponse> => {
      // Client-side timing so we can see the true user-perceived latency —
      // Convex action round-trip + Zod parse. Logs once per fetch (TanStack
      // handles deduping), which makes it cheap to keep on in production.
      // Useful when debugging graph slowness: compare this number against
      // the server-side Cypher timing to spot network vs. query regressions.
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const result = await getGraphData({
        focus: scope === "local" ? (focusNodeId ?? undefined) : undefined,
        profileId: profileId ?? undefined,
        mode: scope,
        depth: scope === "local" ? depth : undefined,
        nodeLimit: scope === "global" ? nodeLimit : undefined,
      });
      const parsed = graphResponseSchema.parse(result);
      const endedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      console.log(
        `[graph] fetch+parse: ${(endedAt - startedAt).toFixed(0)}ms ` +
          `(nodes=${parsed.nodes.length} tagEdges=${parsed.tagEdges.length} ` +
          `relatesTo=${parsed.relatesToEdges.length})`,
      );
      return parsed;
    },
    enabled: isAuthenticated && enabled,
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

  const graphData = graphQuery.data;

  const allRelatesToEdges = useMemo(() => {
    const apiEdges = graphData?.relatesToEdges ?? [];
    return [...apiEdges, ...liveRelatesToEdges];
  }, [graphData?.relatesToEdges, liveRelatesToEdges]);

  return {
    apiNodes: graphData?.nodes ?? [],
    apiTagEdges: graphData?.tagEdges ?? [],
    allRelatesToEdges,
    apiWikiParentEdges: graphData?.wikiParentEdges ?? [],
    apiMentionsEdges: graphData?.mentionsEdges ?? [],
    resolvedFocusNodeId: graphData?.focusNodeId ?? null,
    totalMemoryCount: graphData?.totalMemoryCount ?? null,
    isLoading: graphQuery.isLoading,
    isFetching: graphQuery.isFetching,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
