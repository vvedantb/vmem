import { createClerkClient } from "@clerk/chrome-extension/client";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

// Offscreen documents are full HTML pages with DOM, so Clerk's JWT handler
// can read syncHost cookies and mint Convex tokens here. The service worker
// can't do this itself — it has no DOM. We use background: true so Clerk
// skips its UI bundle (we only need the JWT handler).
type ClerkClient = Awaited<ReturnType<typeof createClerkClient>>;

let clerkPromise: Promise<ClerkClient> | null = null;

function getClerk(): Promise<ClerkClient> {
  if (!clerkPromise) {
    clerkPromise = createClerkClient({
      publishableKey: CLERK_PUBLISHABLE_KEY,
      syncHost: CLERK_SYNC_HOST,
      background: true,
    });
  }
  return clerkPromise;
}

interface RefreshResponse {
  token: string | null;
}

chrome.runtime.onMessage.addListener(
  (
    message: { type?: unknown } | undefined,
    _sender,
    sendResponse: (response: RefreshResponse) => void,
  ) => {
    if (!message || message.type !== "OFFSCREEN_REFRESH_TOKEN") return false;

    void (async () => {
      try {
        const clerk = await getClerk();
        const session = clerk.session;
        if (!session) {
          sendResponse({ token: null });
          return;
        }
        const token = await session.getToken({ template: "convex" });
        sendResponse({ token: token ?? null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[vmem-offscreen] Token refresh failed:", msg);
        sendResponse({ token: null });
      }
    })();

    return true;
  },
);
