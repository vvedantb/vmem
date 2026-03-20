import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

type MemoryEventType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "relationship_created"
  | "relationship_deleted";

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient | null {
  if (client) return client;
  const url = process.env.CONVEX_URL;
  if (!url) {
    console.warn("CONVEX_URL not set — memory events will not be pushed");
    return null;
  }
  client = new ConvexHttpClient(url);
  return client;
}

export function pushMemoryEvent(
  clerkId: string,
  eventType: MemoryEventType,
  memoryId: string,
  payload: Record<string, string | string[] | number | null>,
): void {
  const convex = getClient();
  if (!convex) return;

  const secret = process.env.CONVEX_EVENT_SECRET;
  if (!secret) {
    console.warn("CONVEX_EVENT_SECRET not set — skipping event push");
    return;
  }

  convex
    .mutation(anyApi.memoryEvents.pushEvent, {
      secret,
      clerkId,
      eventType,
      memoryId,
      payload: JSON.stringify(payload),
    })
    .catch((err: Error) => {
      console.error("Failed to push memory event:", err.message);
    });
}
