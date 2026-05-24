import { createClerkClient } from "@clerk/chrome-extension/client";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

/**
 * Mint a Convex JWT using Clerk's syncHost cookie bridge.
 * Requires `background: true` so the client reads __clerk_db_jwt / __client
 * from the web app via chrome.cookies (see @clerk/chrome-extension client).
 */
export async function refreshConvexTokenFromClerk(): Promise<string | null> {
  const clerk = await createClerkClient({
    publishableKey: CLERK_PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    background: true,
  });

  const session = clerk.session;
  if (!session) {
    return null;
  }

  const token = await session.getToken({ template: "convex" });
  return token ?? null;
}
