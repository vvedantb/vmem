"use client";

import { IconLoader2, IconClockHour4 } from "@tabler/icons-react";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import TimelineView from "./TimelineView";

interface HistoryTabProps {
  memoryId: string;
}

export default function HistoryTab({ memoryId }: HistoryTabProps) {
  const { events, isLoading } = useTimelineEvents({
    memoryId,
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <IconClockHour4 className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No history yet</p>
      </div>
    );
  }

  return <TimelineView events={events} mode="history" />;
}
