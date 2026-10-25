"use node";

import { createClerkClient } from "@clerk/backend";
import { getClerkClient } from "@vvedantb/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { planSlugsFromItems } from "./lib/vPlan";

const PAGE_SIZE = 50;

type ClerkIdsPage = {
  clerkIds: string[];
  continueCursor: string;
  isDone: boolean;
};

// ONE-OFF after the webhook ships: copy active Clerk Billing plan slugs onto
// every user row. Run with:
//   npx convex run clerkBillingBackfill:backfillUserPlanSlugs
// Users without a subscription are counted and skipped. Safe to re-run.
export const backfillUserPlanSlugs = internalAction({
  args: {},
  returns: v.object({
    synced: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx) => {
    const clerk = getClerkClient(createClerkClient);
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: ClerkIdsPage = await ctx.runQuery(
        internal.clerkBilling.listClerkIdsPageInternal,
        { cursor, numItems: PAGE_SIZE },
      );
      for (const clerkId of page.clerkIds) {
        try {
          const subscription =
            await clerk.billing.getUserBillingSubscription(clerkId);
          await ctx.runMutation(
            internal.clerkBilling.replacePlanSlugsInternal,
            {
              clerkId,
              planSlugs: planSlugsFromItems(
                subscription.subscriptionItems.map((item) => ({
                  status: item.status,
                  plan: item.plan,
                })),
              ),
            },
          );
          synced += 1;
        } catch (err) {
          // Clerk answers 404 when the user never subscribed.
          if (err instanceof Error && isNotFound(err)) {
            skipped += 1;
          } else {
            failed += 1;
            console.error(
              "[backfillUserPlanSlugs]",
              clerkId,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log("[backfillUserPlanSlugs]", { synced, skipped, failed });
    return { synced, skipped, failed };
  },
});

function isNotFound(err: Error): boolean {
  return "status" in err && err.status === 404;
}
