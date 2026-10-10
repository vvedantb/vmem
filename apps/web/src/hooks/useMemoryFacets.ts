import { useAction, useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import {
  memoryFromSummary,
  type Memory,
  type MemorySummary,
} from "@/lib/memories";
import { MEMORY_FACETS_KEY } from "@/lib/memory-facets-cache";
import { useActiveProfileId } from "@/components/workspace/active-profile";

const FACETS_STALE_MS = 5 * 60 * 1000;
const FACETS_ROW_CAP = 10_000;

// Every memory in the active workspace as slim rows (title, tags, type, source,
// preview), for tag / source / type facets, tag suggestions and pickers. This is
// deliberately NOT a reactive query: one scope walk per fetch, cached for five
// minutes and shared by every consumer, and only fetched while a consumer is
// `enabled`. Writes patch the cache optimistically and refetch (debounced).
export function useMemoryFacets({ enabled }: { enabled: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const listAll = useAction(api.memoryApi.listAllSummaries);
  const active = enabled && isAuthenticated && activeProfileId !== undefined;

  const query = useQuery({
    queryKey: [MEMORY_FACETS_KEY, activeProfileId ?? null],
    enabled: active,
    staleTime: FACETS_STALE_MS,
    queryFn: async (): Promise<MemorySummary[]> => {
      const result = await listAll({
        profileId: activeProfileId,
        limit: FACETS_ROW_CAP,
      });
      return result.memories;
    },
  });

  const memories: Memory[] = query.data?.map(memoryFromSummary) ?? [];
  return {
    memories,
    isLoading: active && query.isLoading,
    isError: query.isError,
  };
}
