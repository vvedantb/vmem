import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import type { TimelineEvent } from "@/lib/timeline";

interface UseTimelineEventsOptions {
  memoryId?: string;
  tag?: string;
  query?: string;
  enabled?: boolean;
}

interface UseTimelineEventsResult {
  events: TimelineEvent[];
  isLoading: boolean;
}

export function useTimelineEvents({
  memoryId,
  tag,
  query,
  enabled = true,
}: UseTimelineEventsOptions): UseTimelineEventsResult {
  const getMemoryTimeline = useAction(api.timelineApi.getMemoryTimeline);
  const getTopicTimeline = useAction(api.timelineApi.getTopicTimeline);
  const getSearchTimeline = useAction(api.timelineApi.getSearchTimeline);

  const hasTarget =
    (memoryId !== undefined && memoryId.length > 0) ||
    (tag !== undefined && tag.length > 0) ||
    (query !== undefined && query.length > 0);

  const timelineQuery = useQuery({
    queryKey: ["timeline", memoryId, tag, query],
    enabled: enabled && hasTarget,
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (memoryId !== undefined && memoryId.length > 0) {
        return getMemoryTimeline({ memoryId });
      }
      if (tag !== undefined && tag.length > 0) {
        return getTopicTimeline({ tag, limit: 200, offset: 0 });
      }
      if (query !== undefined && query.length > 0) {
        return getSearchTimeline({ query, limit: 200, offset: 0 });
      }
      return [];
    },
  });

  return {
    events: timelineQuery.data ?? [],
    isLoading: timelineQuery.isLoading,
  };
}
