import { useConvexAuth, useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { memoryFromApi, type Memory } from "@/lib/memories";
import { useActiveProfileId } from "@/components/workspace/active-profile";

const RECENT_MEMORIES_LIMIT = 1000;

function recentMemoriesQueryKey(profileId: string | undefined) {
  return ["memories", "recent", profileId ?? "none"] as const;
}

export function useRecentMemories() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfileId = useActiveProfileId();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  const query = useQuery({
    queryKey: recentMemoriesQueryKey(activeProfileId),
    queryFn: async (): Promise<Memory[]> => {
      const data = await listMemoriesAction({
        limit: RECENT_MEMORIES_LIMIT,
        offset: 0,
        profileId: activeProfileId,
      });
      return data.memories.map((m) => memoryFromApi(m));
    },
    enabled: isAuthenticated && activeProfileId !== undefined,
  });

  return {
    memories: query.data ?? [],
    isLoading: query.isLoading,
  };
}
