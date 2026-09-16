import { sendMessage } from "@/lib/messaging";
import { parseClerkPageTokenMessage } from "@/lib/clerk-page-token-message";
import { readSessionJwtFromCookieHeader } from "@/lib/clerk-session-cookie";
import { errorMessage } from "@/lib/error";

const RETRIES = 20;
const DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function syncSessionCookie(): Promise<boolean> {
  const sessionJwt = readSessionJwtFromCookieHeader(document.cookie);
  if (!sessionJwt) return false;
  const result = await sendMessage("syncClerkSession", { sessionJwt });
  return result.ok;
}

async function syncUntilOk(): Promise<void> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      if (await syncSessionCookie()) return;
    } catch (error: unknown) {
      if (attempt === RETRIES - 1) {
        console.warn(
          "[vmem] Could not sync Clerk session cookie:",
          errorMessage(error),
        );
      }
    }
    await sleep(DELAY_MS);
  }
}

export function startClerkSessionCookieSync(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const jwt = parseClerkPageTokenMessage(event.data);
    if (!jwt) return;
    void sendMessage("syncClerkConvexToken", { token: jwt }).catch(
      (error: unknown) => {
        console.warn(
          "[vmem] Could not store page-minted Convex token:",
          errorMessage(error),
        );
      },
    );
  });
  void syncUntilOk();
}
