import type { Promotion, RawEvent } from "../../modules/vmem-tracker/src/api";
import { shareItem } from "./share";
import { planUsage } from "./usage";

/**
 * Turns raw native events into review items. One batcher per capture kind:
 *
 * - `app_usage`: one item per app per finished UTC hour (`planUsage`).
 * - `share`: one item per share, right away.
 * - `screen_text` (phase 2) and `notification` (phase 3): no batcher yet, so
 *   their events stay in the buffer untouched.
 */
export function buildPromotion(
  events: readonly RawEvent[],
  options: { collectedThroughMs: number; installId: string },
): Promotion {
  const usage = planUsage(events, options);
  const shares = events.filter((event) => event.kind === "share");
  const shareItems = shares.map(shareItem).filter((item) => item !== null);
  return {
    items: [...usage.items, ...shareItems],
    // A share with no text makes no item; delete it all the same.
    deleteEventIds: [
      ...usage.deleteEventIds,
      ...shares.map((event) => event.id),
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
