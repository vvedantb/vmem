import { createClerkClient } from "@clerk/chrome-extension/client";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

type RefreshMessage = { type: "REFRESH_CONVEX_TOKEN" };
type RefreshResponse = { token: string | null };

chrome.runtime.onMessage.addListener(
  (
    message: RefreshMessage,
    _sender,
    sendResponse: (response: RefreshResponse) => void,
  ) => {
    if (message.type !== "REFRESH_CONVEX_TOKEN") return false;

    void (async () => {
      try {
        const clerk = await createClerkClient({
          publishableKey: CLERK_PUBLISHABLE_KEY,
          syncHost: CLERK_SYNC_HOST,
        });
        const session = clerk.session;
        if (!session) {
          sendResponse({ token: null });
          return;
        }
        const token = await session.getToken({ template: "convex" });
        sendResponse({ token: token ?? null });
      } catch {
        sendResponse({ token: null });
      }
    })();

    return true;
  },
);
