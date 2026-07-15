"use client";

import { useEffect, useMemo, useState } from "react";
import { IconClockHour4 } from "@tabler/icons-react";
import { cn } from "@vmem/ui";
import { formatDateTime } from "@vmem/shared";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useVersionChain } from "@/hooks/useVersionChain";
import type { VersionEntry } from "@/lib/timeline";
import DiffDisplay from "./DiffDisplay";
import { VmemSpinner } from "@/components/svg-animations";
import { DetailEmptyState } from "./detail-panel/DetailEmptyState";

interface HistoryTabProps {
  memoryId: string;
}

function formatChangeSentence(
  version: VersionEntry,
  previousVersion: VersionEntry | null,
): string {
  if (version.action === "created") return "Created";
  if (version.action === "deleted") return "Deleted";
  if (version.action === "proposal_approved") return "Proposal approved";
  if (version.action === "proposal_rejected") return "Proposal rejected";

  const parts: string[] = [];
  const titleChanged =
    previousVersion !== null &&
    previousVersion.snapshot.title !== version.snapshot.title;

  if (titleChanged) parts.push("Title changed");

  const summary = version.changeSummary;
  if (summary !== null) {
    if (summary.addedChars > 0 || summary.removedChars > 0) {
      parts.push("Edited content");
    }
    if (summary.tagsAdded.length > 0) {
      const count = summary.tagsAdded.length;
      parts.push(`added ${count} ${count === 1 ? "tag" : "tags"}`);
    }
    if (summary.tagsRemoved.length > 0) {
      const count = summary.tagsRemoved.length;
      parts.push(`removed ${count} ${count === 1 ? "tag" : "tags"}`);
    }
  }

  if (parts.length === 0) return "Updated";
  return parts.join(" · ");
}

function rewriteMagnitude(version: VersionEntry): number {
  const summary = version.changeSummary;
  if (summary === null) {
    return version.action === "created" ? 1 : 0;
  }
  return summary.addedChars + summary.removedChars;
}

function stubTone(action: string): "danger" | "warning" | "default" {
  if (action === "deleted") return "danger";
  if (action === "proposal_rejected") return "warning";
  return "default";
}

function RetellingStrip({
  versions,
  selectedVersion,
  onSelectVersion,
}: {
  versions: VersionEntry[];
  selectedVersion: number;
  onSelectVersion: (version: number) => void;
}) {
  const magnitudes = versions.map(rewriteMagnitude);
  const maxMagnitude = Math.max(1, ...magnitudes);

  return (
    <div
      role="tablist"
      aria-label="Memory versions"
      className="flex min-w-0 gap-0.5 overflow-x-auto scrollbar-thin"
    >
      {versions.map((version, index) => {
        const selected = version.version === selectedVersion;
        const magnitude = magnitudes[index] ?? 0;
        const tickHeight = 4 + Math.round((magnitude / maxMagnitude) * 12);
        const tone = stubTone(version.action);

        return (
          <button
            key={version.eventId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`Version ${version.version}`}
            onClick={() => onSelectVersion(version.version)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1.5 rounded-lg px-2.5 py-2 transition-[background-color] duration-150",
              selected ? "bg-surface-tertiary" : "hover:bg-surface-tertiary",
            )}
          >
            <span
              className={cn(
                "w-1 rounded-full",
                tone === "danger" && "bg-danger/70",
                tone === "warning" && "bg-warning/70",
                tone === "default" &&
                  (selected ? "bg-foreground" : "bg-muted/50"),
              )}
              style={{ height: `${tickHeight}px` }}
              aria-hidden
            />
            <span
              className={cn(
                "text-[11px] tabular-nums",
                selected ? "text-foreground" : "text-muted",
              )}
            >
              v{version.version}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function HistoryTab({ memoryId }: HistoryTabProps) {
  const { events, isLoading } = useTimelineEvents({
    memoryId,
    enabled: true,
  });

  const { versions, isEmpty, totalVersions } = useVersionChain(events);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const currentSelected = selectedVersion ?? totalVersions;

  const selectedEntry = useMemo(
    () => versions.find((v) => v.version === currentSelected) ?? null,
    [versions, currentSelected],
  );

  const previousEntry = useMemo(() => {
    if (selectedEntry === null || selectedEntry.version <= 1) return null;
    return (
      versions.find((v) => v.version === selectedEntry.version - 1) ?? null
    );
  }, [versions, selectedEntry]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (totalVersions <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedVersion((current) => {
          const active = current ?? totalVersions;
          return Math.max(1, active - 1);
        });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedVersion((current) => {
          const active = current ?? totalVersions;
          return Math.min(totalVersions, active + 1);
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [totalVersions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <VmemSpinner size={20} className="text-muted" />
      </div>
    );
  }

  if (isEmpty || selectedEntry === null) {
    return (
      <DetailEmptyState
        icon={IconClockHour4}
        title="No history yet"
        description="Edits and imports will appear here as versions you can browse."
      />
    );
  }

  const titleChanged =
    previousEntry !== null &&
    previousEntry.snapshot.title !== selectedEntry.snapshot.title;
  const summary = selectedEntry.changeSummary;
  const hasTagDeltas =
    summary !== null &&
    (summary.tagsAdded.length > 0 || summary.tagsRemoved.length > 0);

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden pb-2">
      {totalVersions > 1 ? (
        <RetellingStrip
          versions={versions}
          selectedVersion={currentSelected}
          onSelectVersion={setSelectedVersion}
        />
      ) : null}

      <p className="text-xs text-muted">
        <time className="tabular-nums text-foreground/80">
          {formatDateTime(selectedEntry.createdAt)}
        </time>
        <span aria-hidden> · </span>
        <span>{selectedEntry.actor}</span>
        <span aria-hidden> · </span>
        <span>{formatChangeSentence(selectedEntry, previousEntry)}</span>
      </p>

      <div className="min-w-0 space-y-3">
        {titleChanged && previousEntry !== null ? (
          <h4 className="min-w-0 text-sm font-medium leading-snug text-pretty">
            <span className="text-muted line-through">
              {previousEntry.snapshot.title}
            </span>
            <span className="mx-1.5 text-muted" aria-hidden>
              →
            </span>
            <span className="text-foreground">
              {selectedEntry.snapshot.title}
            </span>
          </h4>
        ) : null}

        {previousEntry !== null ? (
          <DiffDisplay
            oldText={previousEntry.snapshot.content}
            newText={selectedEntry.snapshot.content}
          />
        ) : (
          <p className="overflow-wrap-anywhere whitespace-pre-wrap text-sm leading-relaxed text-pretty text-foreground/80">
            {selectedEntry.snapshot.content}
          </p>
        )}

        {hasTagDeltas && summary !== null ? (
          <p className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs">
            {summary.tagsAdded.map((tag) => (
              <span key={`add-${tag}`} className="text-success">
                +{tag}
              </span>
            ))}
            {summary.tagsRemoved.map((tag) => (
              <span key={`rem-${tag}`} className="text-danger line-through">
                {tag}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
