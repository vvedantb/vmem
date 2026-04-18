"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";

interface RelationshipEvent {
  eventType: "relationship_created" | "relationship_deleted";
  source: string;
  target: string;
  reason?: string;
}

type RelationshipEventHandler = (event: RelationshipEvent) => void;

export function useMemoryEvents(
  onRelationshipEvent?: RelationshipEventHandler,
) {
  const queryClient = useQueryClient();
  const [since] = useState(() => Date.now());
  const processedRef = useRef(new Set<string>());

  const events = useConvexQuery(api.memoryEvents.getRecentEvents, {
    since,
  });

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
    }
  }, [events, queryClient, onRelationshipEvent]);
}
