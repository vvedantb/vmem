"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
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
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    let promise: Promise<unknown> | null = null;

    if (memoryId) {
      promise = getMemoryTimeline({ memoryId });
    } else if (tag) {
      promise = getTopicTimeline({ tag, limit: 200, offset: 0 });
    } else if (query) {
      promise = getSearchTimeline({ query, limit: 200, offset: 0 });
    }

    if (!promise) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    promise
      .then((data) => {
        if (cancelled) return;
        setEvents(data as TimelineEvent[]);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    memoryId,
    tag,
    query,
    enabled,
    getMemoryTimeline,
    getTopicTimeline,
    getSearchTimeline,
  ]);

  return { events, isLoading };
}
