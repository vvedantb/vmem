import { verifyWebhook } from "@clerk/backend/webhooks";
import { internal } from "../../_generated/api";
import { httpAction, type ActionCtx } from "../../_generated/server";
import { planSlugsFromItems } from "../../lib/vPlan";

// Clerk Billing webhook. Verified with CLERK_WEBHOOK_SIGNING_SECRET; any
// failure answers 400 so Clerk retries. B2C events carry payer.user_id.
// Org-only and unrelated events answer 200 and change nothing.
export const clerkWebhook = httpAction(async (ctx, req) => {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[clerkWebhook] CLERK_WEBHOOK_SIGNING_SECRET is not set");
    return new Response("Webhook not configured", { status: 400 });
  }
  let evt: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    evt = await verifyWebhook(req, { signingSecret });
  } catch (err) {
    console.error(
      "[clerkWebhook] verify failed",
      err instanceof Error ? err.message : err,
    );
    return new Response("Invalid webhook", { status: 400 });
  }
  await dispatchBillingEvent(ctx, evt);
  return new Response(null, { status: 200 });
});

async function dispatchBillingEvent(
  ctx: Pick<ActionCtx, "runMutation">,
  evt: Awaited<ReturnType<typeof verifyWebhook>>,
): Promise<void> {
  switch (evt.type) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.active":
    case "subscription.pastDue": {
      const clerkId = evt.data.payer.user_id;
      if (!clerkId) return;
      await ctx.runMutation(internal.clerkBilling.replacePlanSlugsInternal, {
        clerkId,
        planSlugs: planSlugsFromItems(evt.data.items),
      });
      return;
    }
    case "subscriptionItem.updated":
    case "subscriptionItem.active":
    case "subscriptionItem.canceled":
    case "subscriptionItem.ended":
    case "subscriptionItem.abandoned":
    case "subscriptionItem.incomplete":
    case "subscriptionItem.pastDue": {
      const clerkId = evt.data.payer?.user_id;
      const slug = evt.data.plan?.slug;
      if (!clerkId || !slug) return;
      await ctx.runMutation(internal.clerkBilling.applyPlanItemInternal, {
        clerkId,
        status: evt.data.status,
        slug,
      });
      return;
    }
    default:
      return;
  }
}
