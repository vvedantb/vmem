"use client";

/**
 * Hooks for fetching the Phase-1 codebase graph payload.
 *
 * Two queries:
 *   - `useCodebaseOverview`: lightweight stats only (drives the header
 *     `<files>/<fns>/<classes>/<processes>` line). Cached aggressively.
 *   - `useCodebaseGraphData`: full nodes+edges payload, takes filter
 *     args. Re-fetches when filters change so the canvas matches what
 *     the user picked.
 */
import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@vmem/backend";

// ---- Zod schemas ----

const symbolKindSchema = z.union([
  z.literal("code-file"),
  z.literal("code-function"),
  z.literal("code-class"),
  z.literal("code-interface"),
  z.literal("code-process"),
]);

const edgeTypeSchema = z.union([
  z.literal("imports"),
  z.literal("calls"),
  z.literal("contains"),
  z.literal("has_method"),
  z.literal("extends"),
  z.literal("implements"),
  z.literal("starts_process"),
  z.literal("includes"),
]);

const tierSchema = z.union([
  z.literal("EXTRACTED"),
  z.literal("INFERRED"),
  z.literal("AMBIGUOUS"),
]);

const codeNodeSchema = z.object({
  id: z.string(),
  kind: symbolKindSchema,
  name: z.string(),
  path: z.string(),
  directory: z.string(),
  isExported: z.boolean().optional(),
  isAsync: z.boolean().optional(),
  isTest: z.boolean().optional(),
});

const codeEdgeSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: edgeTypeSchema,
  confidence: z.number().optional(),
  tier: tierSchema.optional(),
});

const graphResponseSchema = z.object({
  nodes: z.array(codeNodeSchema),
  edges: z.array(codeEdgeSchema),
});

const overviewSchema = z.object({
  fileCount: z.number(),
  functionCount: z.number(),
  classCount: z.number(),
  interfaceCount: z.number(),
  processCount: z.number(),
  callEdgeCount: z.number(),
  importEdgeCount: z.number(),
});

const symbolNeighbourSchema = z.object({
  id: z.string(),
  name: z.string(),
  filePath: z.string(),
});

const symbolProcessSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const symbolContextSchema = z.object({
  id: z.string(),
  kind: symbolKindSchema,
  name: z.string(),
  qualifiedName: z.string(),
  filePath: z.string(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  isExported: z.boolean().optional(),
  isAsync: z.boolean().optional(),
  isTest: z.boolean().optional(),
  callsIn: z.array(symbolNeighbourSchema),
  callsOut: z.array(symbolNeighbourSchema),
  processes: z.array(symbolProcessSchema),
});

export type CodeNode = z.infer<typeof codeNodeSchema>;
export type CodeEdge = z.infer<typeof codeEdgeSchema>;
export type CodeNodeKind = z.infer<typeof symbolKindSchema>;
export type CodebaseOverviewStats = z.infer<typeof overviewSchema>;
export type CodeSymbolContext = z.infer<typeof symbolContextSchema>;

export interface UseCodebaseGraphDataReturn {
  nodes: CodeNode[];
  edges: CodeEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface UseCodebaseOverviewReturn {
  stats: CodebaseOverviewStats | null;
  isLoading: boolean;
  isError: boolean;
}

export interface CodebaseGraphFilters {
  kinds?: CodeNodeKind[];
  processId?: string | null;
  blastRadiusOf?: string | null;
  blastDirection?: "upstream" | "downstream";
  blastDepth?: number;
}

/** Stats-only hook used by the header stat line + dashboard cards. */
export function useCodebaseOverview(
  codebaseId: string | null,
): UseCodebaseOverviewReturn {
  const { isAuthenticated } = useConvexAuth();
  const getOverview = useAction(api.codebaseSymbols.getOverview);
  const overviewQuery = useTanstackQuery({
    queryKey: ["codebase-overview", codebaseId],
    queryFn: async (): Promise<CodebaseOverviewStats> => {
      if (!codebaseId) throw new Error("No codebase ID");
      const result = await getOverview({ codebaseId });
      return overviewSchema.parse(result);
    },
    enabled: isAuthenticated && !!codebaseId,
    staleTime: 30_000,
  });
  return {
    stats: overviewQuery.data ?? null,
    isLoading: overviewQuery.isLoading,
    isError: overviewQuery.isError,
  };
}

/** Filter-driven full-payload hook used by the canvas. */
export function useCodebaseGraphData(
  codebaseId: string | null,
  filters: CodebaseGraphFilters = {},
): UseCodebaseGraphDataReturn {
  const { isAuthenticated } = useConvexAuth();
  const getGraph = useAction(api.codebaseSymbols.getGraph);

  // Stable cache key — includes every filter so re-applying the same
  // filters doesn't refetch but a change does.
  const filterKey = [
    filters.kinds?.slice().sort().join(","),
    filters.processId ?? "",
    filters.blastRadiusOf ?? "",
    filters.blastDirection ?? "",
    filters.blastDepth ?? "",
  ].join("|");

  const graphQuery = useTanstackQuery({
    queryKey: ["codebase-graph", codebaseId, filterKey],
    queryFn: async () => {
      if (!codebaseId) throw new Error("No codebase ID");
      const result = await getGraph({
        codebaseId,
        kinds: filters.kinds,
        processId: filters.processId ?? undefined,
        blastRadiusOf: filters.blastRadiusOf ?? undefined,
        blastDirection: filters.blastDirection,
        blastDepth: filters.blastDepth,
      });
      return graphResponseSchema.parse(result);
    },
    enabled: isAuthenticated && !!codebaseId,
    staleTime: 30_000,
  });

  return {
    nodes: graphQuery.data?.nodes ?? [],
    edges: graphQuery.data?.edges ?? [],
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}

export interface UseSymbolContextReturn {
  context: CodeSymbolContext | null;
  isLoading: boolean;
  isError: boolean;
}

/** Detail-panel data source. Fetches calls-in / calls-out / processes for a
 *  single symbol. Disabled when no symbol is selected so the panel close
 *  short-circuits the network round-trip. */
export function useSymbolContext(
  codebaseId: string | null,
  symbolId: string | null,
): UseSymbolContextReturn {
  const { isAuthenticated } = useConvexAuth();
  const getContext = useAction(api.codebaseSymbols.getContext);
  const ctxQuery = useTanstackQuery({
    queryKey: ["codebase-symbol-context", codebaseId, symbolId],
    queryFn: async (): Promise<CodeSymbolContext | null> => {
      if (!codebaseId || !symbolId) return null;
      const result = await getContext({ codebaseId, symbolId });
      if (result === null) return null;
      return symbolContextSchema.parse(result);
    },
    enabled: isAuthenticated && !!codebaseId && !!symbolId,
    staleTime: 30_000,
  });
  return {
    context: ctxQuery.data ?? null,
    isLoading: ctxQuery.isLoading,
    isError: ctxQuery.isError,
  };
}
