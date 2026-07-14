"use client";

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
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

interface UseTrailDataResult {
  trailMap: Map<string, TrailEntry>;
  isLoading: boolean;
}

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

export function useTrailData({ tag }: UseTrailDataOptions): UseTrailDataResult {
  const getTopicTimeline = useAction(api.timelineApi.getTopicTimeline);
  const [trailMap, setTrailMap] = useState<Map<string, TrailEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tag) {
      setTrailMap(new Map());
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getTopicTimeline({ tag, limit: 200, offset: 0 })
      .then((events) => {
        if (cancelled) return;
        setTrailMap(buildTrailMap(events));
      })
      .catch(() => {
        if (!cancelled) setTrailMap(new Map());
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tag, getTopicTimeline]);

  return { trailMap, isLoading };
}
