import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type {
  CodeEdge,
  CodeNode,
  CodebaseSymbolContext,
} from "@/components/codebases/-types";

const EMPTY_NODES: CodeNode[] = [];
const EMPTY_EDGES: CodeEdge[] = [];

interface CodebaseGraphFilters {
  processId?: string | null;
  blastRadiusOf?: string | null;
  blastDirection?: "upstream" | "downstream";
}

export function useCodebaseGraphData(
  codebaseId: string,
  filters: CodebaseGraphFilters,
) {
  const { isAuthenticated } = useConvexAuth();
  const getGraph = useAction(api.codebaseSymbols.getGraph);

  const graphQuery = useTanstackQuery({
    queryKey: [
      "codebase-graph",
      codebaseId,
      {
        processId: filters.processId ?? null,
        blastRadiusOf: filters.blastRadiusOf ?? null,
        blastDirection: filters.blastDirection ?? null,
      },
    ] as const,
    queryFn: async () => {
      return await getGraph({
        codebaseId,
        processId: filters.processId ?? undefined,
        blastRadiusOf: filters.blastRadiusOf ?? undefined,
        blastDirection: filters.blastDirection,
      });
    },
    enabled: isAuthenticated,
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
  };
}
