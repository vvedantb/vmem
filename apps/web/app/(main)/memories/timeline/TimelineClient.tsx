"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryStates } from "nuqs";
import { useAuth } from "@clerk/nextjs";
import { Tabs, TabsList, TabsTrigger, TabsContent, Input } from "@vmem/ui";
import { IconLoader2, IconSearch, IconClockHour4 } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { clientEnv } from "@/env/client";
import type { TimelineEvent, TimelineMode } from "@/lib/timeline";
import { timelineSearchParams } from "./searchParams";
import TimelineView from "./_components/TimelineView";
import MemorySelector from "./_components/MemorySelector";
import TagSelector from "./_components/TagSelector";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

function isTimelineMode(value: string): value is TimelineMode {
  return value === "history" || value === "trail";
}

export default function TimelineClient() {
  const [params, setParams] = useQueryStates(timelineSearchParams);
  const { getToken } = useAuth();
  const { isLoading: memoriesLoading } = useMemoryContext();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const authFetch = useCallback(
    async (url: string): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { headers });
    },
    [getToken],
  );

  const fetchTimeline = useCallback(
    async (url: string) => {
      setLoading(true);
      try {
        const res = await authFetch(url);
        if (res.ok) {
          const json: { data: TimelineEvent[] } = await res.json();
          setEvents(json.data);
        } else {
          setEvents([]);
        }
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (params.mode === "history" && params.memoryId) {
      fetchTimeline(`${API_URL}/v1/timeline/memory/${params.memoryId}`);
    } else if (params.mode === "trail" && params.tag) {
      fetchTimeline(
        `${API_URL}/v1/timeline/topic?tag=${encodeURIComponent(params.tag)}`,
      );
    } else if (params.mode === "trail" && params.query) {
      fetchTimeline(
        `${API_URL}/v1/timeline/search?q=${encodeURIComponent(params.query)}`,
      );
    }
  }, [params.mode, params.memoryId, params.tag, params.query, fetchTimeline]);

  const handleModeChange = useCallback(
    (value: string) => {
      if (!isTimelineMode(value)) return;
      setParams({ mode: value, memoryId: "", tag: "", query: "" });
      setEvents([]);
    },
    [setParams],
  );

  const handleMemorySelect = useCallback(
    (memoryId: string) => {
      setParams({ memoryId });
    },
    [setParams],
  );

  const handleTagSelect = useCallback(
    (tag: string) => {
      setParams({ tag, query: "" });
    },
    [setParams],
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        setParams({ query: trimmed, tag: "" });
      }
    },
    [setParams],
  );

  const hasSelection = useMemo(() => {
    if (params.mode === "history") return params.memoryId.length > 0;
    return params.tag.length > 0 || params.query.length > 0;
  }, [params.mode, params.memoryId, params.tag, params.query]);

  if (memoriesLoading) {
    return (
      <PageContainer title="Timeline">
        <div className="flex items-center justify-center py-16">
          <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Timeline">
      <Tabs value={params.mode} onValueChange={handleModeChange}>
        <TabsList>
          <TabsTrigger value="history">Memory History</TabsTrigger>
          <TabsTrigger value="trail">Topic Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <MemorySelector
            value={params.memoryId}
            onSelect={handleMemorySelect}
          />
          {loading && (
            <div className="flex items-center justify-center py-12">
              <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && hasSelection && (
            <TimelineView events={events} mode="history" />
          )}
          {!loading && !hasSelection && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <IconClockHour4 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a memory to view its history
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trail" className="space-y-4">
          <div className="space-y-3">
            <TagSelector value={params.tag} onSelect={handleTagSelect} />
            <div className="relative max-w-md">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <IconSearch className="text-muted-foreground" size={16} />
              </div>
              <Input
                type="text"
                placeholder="Or search by keyword..."
                defaultValue={params.query}
                className="pl-9 h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearchSubmit(e.currentTarget.value);
                  }
                }}
              />
            </div>
          </div>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && hasSelection && (
            <TimelineView events={events} mode="trail" />
          )}
          {!loading && !hasSelection && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <IconClockHour4 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a tag or search to explore topic trails
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
