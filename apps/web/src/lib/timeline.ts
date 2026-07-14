export interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

export interface TimelineEvent {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  snapshot: MemorySnapshot | null;
  details: Record<string, string> | null;
  memoryId: string;
  memoryTitle: string;
  connectionType?: "tag" | "related";
  reason?: string;
}

export interface ChangeSummary {
  addedChars: number;
  removedChars: number;
  tagsAdded: string[];
  tagsRemoved: string[];
}

export interface VersionEntry {
  version: number;
  eventId: string;
  action: string;
  actor: string;
  createdAt: string;
  snapshot: MemorySnapshot;
  changeSummary: ChangeSummary | null;
}

export function computeChangeSummary(
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

export function buildVersionChain(events: TimelineEvent[]): VersionEntry[] {
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
}
