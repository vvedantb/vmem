"use client";

import { useState } from "react";
import { IconLoader2, IconClockHour4 } from "@tabler/icons-react";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useVersionChain } from "@/hooks/useVersionChain";
import VersionChainBar from "./VersionChainBar";
import VersionCard from "./VersionCard";

interface HistoryTabProps {
  memoryId: string;
}

export default function HistoryTab({ memoryId }: HistoryTabProps) {
  const { events, isLoading } = useTimelineEvents({
    memoryId,
    enabled: true,
  });

  const { versions, isEmpty } = useVersionChain(events);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Default to latest version when versions load
  const currentSelected = selectedVersion ?? versions.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <IconClockHour4 className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No history yet</p>
      </div>
    );
  }

  return (
    <div>
      <VersionChainBar
        versions={versions}
        selectedVersion={currentSelected}
        onSelectVersion={setSelectedVersion}
      />

      <div className="space-y-2">
        {versions
          .slice()
          .reverse()
          .map((version, reversedIndex) => {
            const originalIndex = versions.length - 1 - reversedIndex;
            const previousVersion =
              originalIndex > 0 ? versions[originalIndex - 1] : null;

            return (
              <VersionCard
                key={version.eventId}
                version={version}
                previousVersion={previousVersion ?? null}
                isSelected={version.version === currentSelected}
                onSelect={() => setSelectedVersion(version.version)}
              />
            );
          })}
      </div>
    </div>
  );
}
