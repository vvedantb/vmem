import { useEffect, useRef, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { z } from "zod";

type MemoryEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "relationship_created"
  | "relationship_deleted";

// inverse of `ACTION_FOR_EVENT` in `packages/backend/convex/memoryEvents.ts`
const EVENT_FOR_ACTION: Record<string, MemoryEventType> = {
  "memory.created": "memory_created",
  "memory.updated": "memory_updated",
  "memory.deleted": "memory_deleted",
  "memory.relationship.created": "relationship_created",
  "memory.relationship.deleted": "relationship_deleted",
};

const relationshipPayloadSchema = z.object({
  source: z.string(),
  target: z.string(),
  reason: z.string().optional(),
});

interface RelationshipEvent {
  eventType: "relationship_created" | "relationship_deleted";
  source: string;
  target: string;
  reason?: string;
}

type RelationshipEventHandler = (event: RelationshipEvent) => void;

export function useMemoryEvents(
  onRelationshipEvent?: RelationshipEventHandler,
  // called once per batch of new memory created/updated/deleted events
  onMemoryEvent?: () => void,
) {
  const queryClient = useQueryClient();
  const [since] = useState(() => Date.now());
  const processedRef = useRef(new Set<string>());
  // Written in an effect (not during render) so React Compiler can compile
  // the file. Declared before the event-processing effect below, so the refs
  // are fresh by the time it runs in the same commit.
  const onRelationshipEventRef = useRef(onRelationshipEvent);
  const onMemoryEventRef = useRef(onMemoryEvent);
  useEffect(() => {
    onRelationshipEventRef.current = onRelationshipEvent;
    onMemoryEventRef.current = onMemoryEvent;
  }, [onRelationshipEvent, onMemoryEvent]);

  const rawEvents = useConvexQuery(api.memoryEvents.getRecentEvents, {
    since,
  });

  useEffect(() => {
    if (!rawEvents || rawEvents.length === 0) return;

    let hasMemoryEvent = false;

    for (const entry of rawEvents) {
      const eventType = EVENT_FOR_ACTION[entry.action];
      if (!eventType) continue;

      const eventId = entry._id;
      if (processedRef.current.has(eventId)) continue;
      processedRef.current.add(eventId);

      if (
        eventType === "memory_created" ||
        eventType === "memory_updated" ||
        eventType === "memory_deleted"
      ) {
        hasMemoryEvent = true;
      }

      if (
        eventType === "relationship_created" ||
        eventType === "relationship_deleted"
      ) {
        const handler = onRelationshipEventRef.current;
        if (handler) {
          try {
            // oxlint-disable-next-line typescript/no-unsafe-assignment -- JSON.parse
            const raw: unknown = JSON.parse(entry.payload);
            const parsed = relationshipPayloadSchema.safeParse(raw);
            if (!parsed.success) continue;
            handler({
              eventType,
              source: parsed.data.source,
              target: parsed.data.target,
              reason: parsed.data.reason,
            });
          } catch {
            // ignore malformed payload
          }
        }
      }
    }

    if (hasMemoryEvent) {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
      onMemoryEventRef.current?.();
    }
  }, [rawEvents, queryClient]);
}
