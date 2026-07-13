export type SeedMemoryType = "profile" | "episodic" | "knowledge";
export type SeedMemoryStatus = "active" | "pinned";
type SeedEventAction = "created" | "updated";

export interface SeedMemory {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: SeedMemoryType;
  source: string;
  confidence: number;
  status: SeedMemoryStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt: null;
}

export interface SeedRelationship {
  sourceId: string;
  targetId: string;
  reason: string;
}

export interface SeedEvent {
  eventId: string;
  memoryId: string;
  action: SeedEventAction;
  createdAt: string;
}
