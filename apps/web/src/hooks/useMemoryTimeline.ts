import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type { TimelineEvent } from "@/lib/timeline";

export function useMemoryTimeline(memoryId: string) {
  const getMemoryTimeline = useAction(api.timelineApi.getMemoryTimeline);

  const timelineQuery = useQuery({
    queryKey: ["memory-timeline", memoryId],
    enabled: memoryId.length > 0,
    queryFn: async (): Promise<TimelineEvent[]> =>
      getMemoryTimeline({ memoryId }),
  });

  return {
    events: timelineQuery.data ?? [],
    isLoading: timelineQuery.isLoading,
  };
}
