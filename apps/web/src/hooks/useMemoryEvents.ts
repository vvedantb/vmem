"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";

type MemoryEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "relationship_created"
  | "relationship_deleted";

/**
 * Inverse of `ACTION_FOR_EVENT` in `packages/backend/convex/memoryEvents.ts`.
 * Backend returns the raw audit-log `action` string; the hook owns this
 * reverse map so the wire shape stays small and the backend doesn't have to
 * know about the compact event-type vocabulary.
 */
const EVENT_FOR_ACTION: Record<string, MemoryEventType> = {
  "memory.created": "memory_created",
  "memory.updated": "memory_updated",
  "memory.deleted": "memory_deleted",
  "memory.relationship.created": "relationship_created",
  "memory.relationship.deleted": "relationship_deleted",
};

interface RelationshipEvent {
  eventType: "relationship_created" | "relationship_deleted";
  source: string;
  target: string;
  reason?: string;
}

type RelationshipEventHandler = (event: RelationshipEvent) => void;

export function useMemoryEvents(
  onRelationshipEvent?: RelationshipEventHandler,
  /** Called once per batch of new memory created/updated/deleted events. */
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
          const payload = JSON.parse(event.payload) as {
            source: string;
            target: string;
            reason?: string;
          };
          onRelationshipEvent({
            eventType: event.eventType,
            source: payload.source,
            target: payload.target,
            reason: payload.reason,
          });
        }
      }
    }

    if (hasMemoryEvent) {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      onMemoryEvent?.();
    }
  }, [events, queryClient, onRelationshipEvent, onMemoryEvent]);
}
