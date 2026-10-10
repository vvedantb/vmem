import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { memoryFromApi } from "@/lib/memories";
import { useActiveProfileId } from "@/components/workspace/active-profile";

const RECENT_MEMORIES_LIMIT = 1000;

export function useRecentMemories() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const data = useQuery(
    api.memoryApi.list,
    isAuthenticated && activeProfileId !== undefined
      ? {
          profileId: activeProfileId,
          limit: RECENT_MEMORIES_LIMIT,
          offset: 0,
        }
      : "skip",
  );

  return {
    memories: data === undefined ? [] : data.memories.map(memoryFromApi),
    isLoading:
      isAuthenticated && activeProfileId !== undefined && data === undefined,
  };
}
