// hooks for fetching the Phase-1 codebase graph payload
import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type {
  CodeNode,
  CodeEdge,
  CodeNodeKind,
  CodebaseSymbolContext,
} from "@/components/codebases/-types";

export type { CodeNode, CodeEdge, CodeNodeKind };

const EMPTY_NODES: CodeNode[] = [];
const EMPTY_EDGES: CodeEdge[] = [];

export interface CodebaseGraphFilters {
  kinds?: CodeNodeKind[];
  processId?: string | null;
  blastRadiusOf?: string | null;
  blastDirection?: "upstream" | "downstream";
  blastDepth?: number;
}

// filter-driven full-payload hook used by the canvas
export function useCodebaseGraphData(
  codebaseId: string | null,
  filters: CodebaseGraphFilters = {},
) {
  const { isAuthenticated } = useConvexAuth();
  const getGraph = useAction(api.codebaseSymbols.getGraph);

  // stable cache key — includes every filter so re-applying the same
  // filters doesn't refetch but a change does
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
      return await getGraph({
        codebaseId,
        kinds: filters.kinds,
        processId: filters.processId ?? undefined,
        blastRadiusOf: filters.blastRadiusOf ?? undefined,
        blastDirection: filters.blastDirection,
        blastDepth: filters.blastDepth,
      });
    },
    enabled: isAuthenticated && !!codebaseId,
    staleTime: 30_000,
  });

  return {
    nodes: graphQuery.data?.nodes ?? EMPTY_NODES,
    edges: graphQuery.data?.edges ?? EMPTY_EDGES,
    truncated: graphQuery.data?.truncated ?? false,
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}

export type UseCodebaseGraphDataReturn = ReturnType<
  typeof useCodebaseGraphData
>;

// detail-panel data source
export function useSymbolContext(
  codebaseId: string | null,
  symbolId: string | null,
) {
  const { isAuthenticated } = useConvexAuth();
  const getContext = useAction(api.codebaseSymbols.getContext);
  const ctxQuery = useTanstackQuery({
    queryKey: ["codebase-symbol-context", codebaseId, symbolId],
    queryFn: async (): Promise<CodebaseSymbolContext | null> => {
      if (!codebaseId || !symbolId) return null;
      return await getContext({ codebaseId, symbolId });
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

export type UseSymbolContextReturn = ReturnType<typeof useSymbolContext>;
