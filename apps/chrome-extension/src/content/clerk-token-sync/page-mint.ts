import { clerkPageTokenMessage } from "@/lib/clerk-page-token-message";
import {
  clerkSessionIdFromJwt,
  readSessionJwtFromCookieHeader,
} from "@/lib/clerk-session-cookie";
import { mintConvexTokenWithPageCookies } from "@/lib/mint-convex-token-from-page";

const RETRIES = 20;
const DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function startPageConvexTokenMint(): void {
  void (async () => {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const sessionJwt = readSessionJwtFromCookieHeader(document.cookie);
      const sessionId = sessionJwt ? clerkSessionIdFromJwt(sessionJwt) : null;
      if (sessionId) {
        const jwt = await mintConvexTokenWithPageCookies(sessionId);
        if (jwt) {
          window.postMessage(
            clerkPageTokenMessage(jwt),
            window.location.origin,
          );
          return;
        }
      }
      await sleep(DELAY_MS);
    }
  })();
}
