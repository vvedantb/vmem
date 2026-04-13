"use client";

import { useState, useEffect } from "react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { clientEnv } from "@/env/client";
import type { TimelineEvent } from "@/lib/timeline";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

export interface TrailEntry {
  connectionType: string;
  reason?: string;
}

interface UseTrailDataOptions {
  tag: string | null;
}

interface UseTrailDataResult {
  trailMap: Map<string, TrailEntry>;
  isLoading: boolean;
}

export function useTrailData({ tag }: UseTrailDataOptions): UseTrailDataResult {
  const authFetch = useAuthFetch();
  const [trailMap, setTrailMap] = useState<Map<string, TrailEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tag) {
      setTrailMap(new Map());
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const url = `${API_URL}/v1/timeline/topic?tag=${encodeURIComponent(tag)}`;

    authFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const json: { data: TimelineEvent[] } = await res.json();
          const map = new Map<string, TrailEntry>();
          for (const event of json.data) {
            if (!map.has(event.memoryId)) {
              map.set(event.memoryId, {
                connectionType: event.connectionType ?? "tag",
                reason: event.reason,
              });
            }
          }
          setTrailMap(map);
        } else {
          setTrailMap(new Map());
        }
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
  }, [tag, authFetch]);

  return { trailMap, isLoading };
}
