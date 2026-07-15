import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";

export interface TrailEntry {
  connectionType: string;
  reason?: string;
}

type TopicTimelineEvents = FunctionReturnType<
  typeof api.timelineApi.getTopicTimeline
>;

interface UseTrailDataOptions {
  tag: string | null;
}

const EMPTY_TRAIL_MAP = new Map<string, TrailEntry>();

function buildTrailMap(events: TopicTimelineEvents): Map<string, TrailEntry> {
  const map = new Map<string, TrailEntry>();
  for (const event of events) {
    if (!map.has(event.memoryId)) {
      map.set(event.memoryId, {
        connectionType: event.connectionType ?? "tag",
      });
    }
  }
  return map;
}

export function useTrailData({
  tag,
}: UseTrailDataOptions): Map<string, TrailEntry> {
  const getTopicTimeline = useAction(api.timelineApi.getTopicTimeline);

  const trailQuery = useQuery({
    queryKey: ["topicTimeline", tag],
    enabled: tag !== null && tag.length > 0,
    queryFn: async () => {
      const events = await getTopicTimeline({
        tag: tag ?? "",
        limit: 200,
        offset: 0,
      });
      return buildTrailMap(events);
    },
  });

  return trailQuery.data ?? EMPTY_TRAIL_MAP;
}
