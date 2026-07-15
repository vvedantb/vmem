import { createClerkClient } from "@clerk/chrome-extension/client";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

function canUseClerkBackgroundClient(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.getManifest === "function"
  );
}

// mint convex jwt via clerk's sw optimised client + syncHost session
export async function refreshConvexTokenFromClerk(): Promise<string | null> {
  if (!canUseClerkBackgroundClient()) {
    return null;
  }

  try {
    const clerk = await createClerkClient({
      publishableKey: CLERK_PUBLISHABLE_KEY,
      syncHost: CLERK_SYNC_HOST,
      background: true,
    });
    if (!clerk.session) return null;
    return (await clerk.session.getToken({ template: "convex" })) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[vmem] Clerk token refresh failed:", message);
    return null;
  }
}
