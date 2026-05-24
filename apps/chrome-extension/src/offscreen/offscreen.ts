import { refreshConvexTokenFromClerk } from "@/lib/refresh-convex-token";

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
        const token = await refreshConvexTokenFromClerk();
        sendResponse({ token });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        console.warn("[vmem] Offscreen Clerk refresh failed:", messageText);
        sendResponse({ token: null });
      }
    })();

    return true;
  },
);
