"use client";

import { useState, useEffect } from "react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { clientEnv } from "@/env/client";
import type { TimelineEvent } from "@/lib/timeline";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

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
  const authFetch = useAuthFetch();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }

    let url: string | null = null;

    if (memoryId) {
      url = `${API_URL}/v1/timeline/memory/${memoryId}`;
    } else if (tag) {
      url = `${API_URL}/v1/timeline/topic?tag=${encodeURIComponent(tag)}`;
    } else if (query) {
      url = `${API_URL}/v1/timeline/search?q=${encodeURIComponent(query)}`;
    }

    if (!url) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    authFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const json: { data: TimelineEvent[] } = await res.json();
          setEvents(json.data);
        } else {
          setEvents([]);
        }
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
  }, [memoryId, tag, query, enabled, authFetch]);

  return { events, isLoading };
}
