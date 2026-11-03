import { verifyWebhook } from "@clerk/backend/webhooks";
import { verifyClerkWebhook } from "@vvedantb/server";
import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { vPro } from "../../vPro";

// Clerk Billing webhook. Verified with CLERK_WEBHOOK_SIGNING_SECRET; any
// failure answers 400 so Clerk retries. B2C events carry payer.user_id.
// Org-only and unrelated events answer 200 and change nothing.
export const clerkWebhook = httpAction(async (ctx, req) => {
  const verified = await verifyClerkWebhook(verifyWebhook, req);
  if (!verified.ok) {
    console.error("[clerkWebhook]", verified.reason, verified.error);
    return new Response(
      verified.reason === "missing-secret"
        ? "Webhook not configured"
        : "Invalid webhook",
      { status: 400 },
    );
  }
  const change = vPro.parseBillingEvent(verified.event);
  if (change) {
    await ctx.runMutation(internal.clerkBilling.applyBillingChangeInternal, {
      change,
    });
  }
  return new Response(null, { status: 200 });
});
