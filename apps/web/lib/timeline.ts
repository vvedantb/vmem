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
}

export type TimelineMode = "history" | "trail";
