"use client";

/**
 * Extracted graph data-fetching hook.
 * Handles API query, Zod validation, and live relationship events.
 */
import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { clientEnv } from "@/env/client";
import type {
  ApiGraphNode,
  ApiTagEdge,
  ApiRelatesToEdge,
} from "@/components/_components/graph-data";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

// ---- Zod schemas ----

const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
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

const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  relatesToEdges: z.array(relatesToEdgeSchema),
  tagEdges: z.array(tagEdgeSchema),
});

type GraphResponse = z.infer<typeof graphResponseSchema>;

// ---- Hook ----

export interface UseGraphDataReturn {
  apiNodes: ApiGraphNode[];
  apiTagEdges: ApiTagEdge[];
  allRelatesToEdges: ApiRelatesToEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useGraphData(focusNodeId: string | null): UseGraphDataReturn {
  const { getToken, userId } = useAuth();
  const [liveRelatesToEdges, setLiveRelatesToEdges] = useState<
    ApiRelatesToEdge[]
  >([]);

  const graphQuery = useTanstackQuery({
    queryKey: ["graph", focusNodeId ?? "global"],
    queryFn: async (): Promise<GraphResponse> => {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const url = focusNodeId
        ? `${API_URL}/v1/graph?focus=${encodeURIComponent(focusNodeId)}`
        : `${API_URL}/v1/graph`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Graph request failed with ${res.status}`);
      }
      return graphResponseSchema.parse(await res.json());
    },
    enabled: !!userId,
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
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
