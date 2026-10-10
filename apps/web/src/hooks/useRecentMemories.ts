import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { memoryFromApi } from "@/lib/memories";
import { useActiveProfileId } from "@/components/workspace/active-profile";

const RECENT_MEMORIES_LIMIT = 1000;

export function useRecentMemories() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const result = useQuery(
    api.memoryApi.listMemories,
    isAuthenticated && activeProfileId !== undefined
      ? {
          limit: RECENT_MEMORIES_LIMIT,
          offset: 0,
          profileId: activeProfileId,
        }
      : "skip",
  );

  return {
    memories: result?.memories.map((row) => memoryFromApi(row)) ?? [],
    isLoading:
      isAuthenticated && activeProfileId !== undefined && result === undefined,
  };
}
