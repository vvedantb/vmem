"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const rawEvents = useConvexQuery(api.memoryEvents.getRecentEvents, {
    since,
  });

  const events = useMemo(() => {
    if (!rawEvents) return rawEvents;
    return rawEvents.flatMap((entry) => {
      const eventType = EVENT_FOR_ACTION[entry.action];
      if (!eventType) return [];
      return [
        {
          _id: entry._id,
          eventType,
          memoryId: entry.resourceId,
          payload: entry.payload,
        },
      ];
    });
  }, [rawEvents]);

  useEffect(() => {
    if (!events || events.length === 0) return;

    let hasMemoryEvent = false;

    for (const event of events) {
      const eventId = event._id;
      if (processedRef.current.has(eventId)) continue;
      processedRef.current.add(eventId);

      if (
        event.eventType === "memory_created" ||
        event.eventType === "memory_updated" ||
        event.eventType === "memory_deleted"
      ) {
        hasMemoryEvent = true;
      }

      if (
        event.eventType === "relationship_created" ||
        event.eventType === "relationship_deleted"
      ) {
        if (onRelationshipEvent) {
          try {
            // oxlint-disable-next-line typescript/no-unsafe-assignment -- JSON.parse
            const raw: unknown = JSON.parse(event.payload);
            const parsed = relationshipPayloadSchema.safeParse(raw);
            if (!parsed.success) continue;
            onRelationshipEvent({
              eventType: event.eventType,
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
      onMemoryEvent?.();
    }
  }, [events, queryClient, onRelationshipEvent, onMemoryEvent]);
}
