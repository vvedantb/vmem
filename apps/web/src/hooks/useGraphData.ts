"use client";

/**
 * Extracted graph data-fetching hook.
 * Handles Convex action query, Zod validation, and live relationship events.
 */
import { useState, useMemo, useCallback } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { api } from "@vmem/backend";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
  ApiWikiParentEdge,
} from "@/components/_components/graph-data";

// ---- Zod schemas ----

const graphNodeKindSchema = z.enum([
  "memory",
  "wiki-document",
  "wiki-folder",
  "skill",
]);

const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  kind: graphNodeKindSchema,
  source: z.string().optional(),
  sourceType: z.string().nullable(),
  type: z.enum(["profile", "episodic", "knowledge"]).optional(),
});

const relatesToEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  reason: z.string(),
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

const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  relatesToEdges: z.array(relatesToEdgeSchema),
  tagEdges: z.array(tagEdgeSchema),
  wikiParentEdges: z.array(wikiParentEdgeSchema),
});

type GraphResponse = z.infer<typeof graphResponseSchema>;

// ---- Hook ----

export interface UseGraphDataReturn {
  apiNodes: ApiGraphNode[];
  apiTagEdges: ApiTagEdge[];
  allRelatesToEdges: ApiRelatesToEdge[];
  apiWikiParentEdges: ApiWikiParentEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useGraphData(
  focusNodeId: string | null,
  profileId: string | null = null,
): UseGraphDataReturn {
  const { isAuthenticated } = useConvexAuth();
  const getGraphData = useAction(api.graphApi.getGraphData);
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const graphQuery = useTanstackQuery({
    queryKey: ["graph", focusNodeId ?? "global", profileId ?? "all"],
    queryFn: async (): Promise<GraphResponse> => {
      const result = await getGraphData({
        focus: focusNodeId ?? undefined,
        profileId: profileId ?? undefined,
      });
      return graphResponseSchema.parse(result);
    },
    enabled: isAuthenticated,
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
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
