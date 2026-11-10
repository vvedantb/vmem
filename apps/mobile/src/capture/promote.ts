import type { Promotion, RawEvent } from "../../modules/vmem-tracker/src/api";
import { clipboardItem, noteItem } from "./note";
import { shareItem } from "./share";
import { planUsage } from "./usage";

/**
 * Turns raw native events into review items. One batcher per capture kind:
 *
 * - `app_usage`: no items. Closed-hour events are drained (`planUsage`).
 * - `share`, `note`, `clipboard`: one item per event, right away.
 * - `calendar`: handled in `calendar.ts`, because it needs the server.
 * - `screen_text` (phase 2) and `notification` (phase 3): no batcher yet, so
 *   their events stay in the buffer untouched.
 */
export function buildPromotion(
  events: readonly RawEvent[],
  options: { collectedThroughMs: number; installId: string },
): Promotion {
  const usage = planUsage(events, options);
  const intentional = events.filter(
    (event) =>
      event.kind === "share" ||
      event.kind === "note" ||
      event.kind === "clipboard",
  );
  const items = intentional
    .map((event) => {
      if (event.kind === "share") return shareItem(event);
      if (event.kind === "note") return noteItem(event);
      return clipboardItem(event);
    })
    .filter((item) => item !== null);
  return {
    items,
    // An empty capture makes no item; delete it all the same.
    deleteEventIds: [
      ...usage.deleteEventIds,
      ...intentional.map((event) => event.id),
    ],
    trimEvents: usage.trimEvents,
  };
}

export function isEmptyPromotion(promotion: Promotion): boolean {
  return (
    promotion.items.length === 0 &&
    promotion.deleteEventIds.length === 0 &&
    promotion.trimEvents.length === 0
  );
}
