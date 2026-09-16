import type { MemoryWithTags } from "@vmem/sdk";
import type { TimelineEvent } from "./types";

export const TIMELINE_ACTOR = "You";

const EDITED_AFTER_CREATE_MS = 1000;

export function clampTimelinePage(
  limit: number,
  offset: number,
): { limit: number; offset: number } {
  const safeLimit = Number.isFinite(limit) ? Math.trunc(limit) : 0;
  const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  return {
    limit: Math.max(1, Math.min(500, safeLimit)),
    offset: Math.max(0, safeOffset),
  };
}

export function timelineEventFromMemory(
  memory: MemoryWithTags,
  options?: {
    connectionType?: NonNullable<TimelineEvent["connectionType"]>;
    actor?: string;
  },
): TimelineEvent {
  const createdMs = Date.parse(memory.createdAt);
  const updatedMs = Date.parse(memory.updatedAt);
  const edited =
    Number.isFinite(createdMs) &&
    Number.isFinite(updatedMs) &&
    updatedMs - createdMs > EDITED_AFTER_CREATE_MS;

  const event: TimelineEvent = {
    id: `${memory.id}:current`,
    action: edited ? "updated" : "created",
    actor: options?.actor ?? TIMELINE_ACTOR,
    details: null,
    snapshot: {
      title: memory.title,
      content: memory.content,
      type: memory.type,
      status: memory.status,
      confidence: memory.confidence,
      tags: [...memory.tags],
    },
    createdAt: edited ? memory.updatedAt : memory.createdAt,
    memoryId: memory.id,
    memoryTitle: memory.title,
  };
  if (options?.connectionType !== undefined) {
    event.connectionType = options.connectionType;
  }
  return event;
}
