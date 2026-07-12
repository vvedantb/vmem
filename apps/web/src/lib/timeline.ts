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
