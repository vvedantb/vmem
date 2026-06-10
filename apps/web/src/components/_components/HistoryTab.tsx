"use client";

import { useState } from "react";
import { IconClockHour4 } from "@tabler/icons-react";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useVersionChain } from "@/hooks/useVersionChain";
import VersionChainBar from "./VersionChainBar";
import VersionCard from "./VersionCard";
import { VmemSpinner } from "@/components/svg-animations";
import { DetailEmptyState } from "./detail-panel/DetailEmptyState";

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

  const currentSelected = selectedVersion ?? versions.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-surface-secondary py-14">
        <VmemSpinner size={20} className="text-muted" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <DetailEmptyState
        icon={IconClockHour4}
        title="No history yet"
        description="Edits and imports will appear here as versions you can browse."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
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
