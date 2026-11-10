import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";

const HOUR_MS = 3_600_000;

export interface UsagePlan {
  items: QueueItemInput[];
  deleteEventIds: number[];
  trimEvents: { id: number; startMs: number }[];
}

function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * Drains closed-hour usage events and never makes review items.
 *
 * UsageStats is local timeline context only. It is not uploaded, so
 * "Used X for N min" memories do not exist. Events fully inside finished
 * hours are deleted; an event that reaches into the current hour is
 * trimmed to start there. This keeps the buffer from growing.
 */
export function planUsage(
  events: readonly RawEvent[],
  options: { collectedThroughMs: number },
): UsagePlan {
  const closedBefore = floorHour(options.collectedThroughMs);
  const deleteEventIds: number[] = [];
  const trimEvents: { id: number; startMs: number }[] = [];

  for (const event of events) {
    if (event.kind !== "app_usage" || event.package === null) continue;
    if (event.startMs >= closedBefore) continue;
    if (event.endMs <= closedBefore) deleteEventIds.push(event.id);
    else trimEvents.push({ id: event.id, startMs: closedBefore });
  }

  return { items: [], deleteEventIds, trimEvents };
}
