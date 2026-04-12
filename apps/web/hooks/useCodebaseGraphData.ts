"use client";

/**
 * Hook to fetch codebase file graph data from the Hono API.
 * Mirrors useGraphData.ts pattern but for codebases.
 */
import { useAuth } from "@clerk/nextjs";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { z } from "zod";
import { clientEnv } from "@/env/client";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

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
  const { getToken, userId } = useAuth();

  const graphQuery = useTanstackQuery({
    queryKey: ["codebase-graph", codebaseId],
    queryFn: async (): Promise<CodebaseGraphResponse> => {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/v1/codebases/${codebaseId}/graph`, {
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Graph request failed with ${res.status}`);
      }
      return codebaseGraphResponseSchema.parse(await res.json());
    },
    enabled: !!userId && !!codebaseId,
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
