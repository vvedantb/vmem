import { sendMessage } from "@/lib/messaging";
import { readSessionJwtFromCookieHeader } from "@/lib/clerk-session-cookie";
import { errorMessage } from "@/lib/error";

async function syncSessionCookie(): Promise<void> {
  const sessionJwt = readSessionJwtFromCookieHeader(document.cookie);
  if (!sessionJwt) return;
  await sendMessage("syncClerkSession", { sessionJwt });
}

export function startClerkSessionCookieSync(): void {
  void syncSessionCookie().catch((error: unknown) => {
    console.warn(
      "[vmem] Could not sync Clerk session cookie:",
      errorMessage(error),
    );
  });
}
