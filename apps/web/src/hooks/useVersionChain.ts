"use client";

import { useMemo } from "react";
import type {
  TimelineEvent,
  MemorySnapshot,
  VersionEntry,
  ChangeSummary,
} from "@/lib/timeline";

function computeChangeSummary(
  prev: MemorySnapshot,
  curr: MemorySnapshot,
): ChangeSummary {
  const prevContent = prev.content;
  const currContent = curr.content;

  // simple character diff (not a real diff algorithm, but good enough for summary)
  const addedChars = Math.max(0, currContent.length - prevContent.length);
  const removedChars = Math.max(0, prevContent.length - currContent.length);

  const prevTags = new Set(prev.tags);
  const currTags = new Set(curr.tags);

  const tagsAdded = curr.tags.filter((t) => !prevTags.has(t));
  const tagsRemoved = prev.tags.filter((t) => !currTags.has(t));

  return {
    addedChars,
    removedChars,
    tagsAdded,
    tagsRemoved,
  };
}

interface UseVersionChainResult {
  versions: VersionEntry[];
  totalVersions: number;
  isEmpty: boolean;
}

export function useVersionChain(
  events: TimelineEvent[],
): UseVersionChainResult {
  const versions = useMemo(() => {
    // filter to only events with snapshots (actual content changes)
    // sort chronologically (oldest first) for version numbering
    const withSnapshots = events
      .filter(
        (e): e is TimelineEvent & { snapshot: MemorySnapshot } =>
          e.snapshot !== null,
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    return withSnapshots.map((event, index): VersionEntry => {
      const prevEvent = index > 0 ? withSnapshots.at(index - 1) : undefined;
      const prevSnapshot = prevEvent?.snapshot ?? null;

      return {
        version: index + 1,
        eventId: event.id,
        action: event.action,
        actor: event.actor,
        createdAt: event.createdAt,
        snapshot: event.snapshot,
        changeSummary:
          prevSnapshot !== null
            ? computeChangeSummary(prevSnapshot, event.snapshot)
            : null,
      };
    });
  }, [events]);

  return {
    versions,
    totalVersions: versions.length,
    isEmpty: versions.length === 0,
  };
}
