"use client";

/**
 * Hook to fetch codebase file graph data via Convex action.
 * Mirrors useGraphData.ts pattern but for codebases.
 */
import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@vmem/backend";

// ---- Zod schemas ----

const codeFileNodeSchema = z.object({
  id: z.string(),
  path: z.string(),
  directory: z.string(),
  filename: z.string(),
  extension: z.string(),
  sizeBytes: z.number(),
});

const importEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  importPath: z.string(),
});

const codebaseGraphResponseSchema = z.object({
  nodes: z.array(codeFileNodeSchema),
  edges: z.array(importEdgeSchema),
});

export type CodeFileNode = z.infer<typeof codeFileNodeSchema>;
export type ImportEdge = z.infer<typeof importEdgeSchema>;
type CodebaseGraphResponse = z.infer<typeof codebaseGraphResponseSchema>;

// ---- Hook ----

export interface UseCodebaseGraphDataReturn {
  nodes: CodeFileNode[];
  edges: ImportEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useCodebaseGraphData(
  codebaseId: string | null,
): UseCodebaseGraphDataReturn {
  const { isAuthenticated } = useConvexAuth();
  const getCodebaseGraph = useAction(api.codebases.getCodebaseGraph);

  const graphQuery = useTanstackQuery({
    queryKey: ["codebase-graph", codebaseId],
    queryFn: async (): Promise<CodebaseGraphResponse> => {
      if (!codebaseId) throw new Error("No codebase ID");
      const result = await getCodebaseGraph({ codebaseId });
      return codebaseGraphResponseSchema.parse(result);
    },
    enabled: isAuthenticated && !!codebaseId,
    staleTime: 60_000,
  });

  return {
    nodes: graphQuery.data?.nodes ?? [],
    edges: graphQuery.data?.edges ?? [],
    isLoading: graphQuery.isLoading,
    isError: graphQuery.isError,
    error: graphQuery.error,
  };
}
