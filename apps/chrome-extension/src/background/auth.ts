import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "@/lib/constants";
import { getAuthToken, setAuthToken } from "@/lib/storage";
import { refreshConvexTokenFromClerk } from "@/lib/refresh-convex-token";

let pendingRefresh: Promise<string | null> | null = null;

async function getStoredToken(): Promise<string> {
  return getAuthToken();
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    const payloadBase64 = parts[1];
    if (parts.length !== 3 || payloadBase64 === undefined) return true;
    const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const expMatch = /"exp"\s*:\s*(\d+)/.exec(atob(padded));
    const expValue = expMatch?.[1];
    if (expValue === undefined) return true;
    return Number(expValue) * 1000 < Date.now() + 10_000;
  } catch {
    return true;
  }
}

/** mint convex jwt in the sw (has cookies; offscreen does not). */
async function refreshTokenFromClerk(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      const token = await refreshConvexTokenFromClerk();
      if (token) {
        await setAuthToken(token);
        return token;
      }

      // Do not clear chrome.storage.session — popup TokenSync may have a
      // valid token even when the syncHost cookie is missing
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[vmem] Clerk token refresh failed:", message);
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

async function getConvexAuthToken(): Promise<string | null> {
  const stored = await getStoredToken();
  if (stored && !isTokenExpired(stored)) {
    return stored;
  }

  const refreshed = await refreshTokenFromClerk();
  if (refreshed) {
    return refreshed;
  }

  return null;
}

export async function warmBackgroundAuth(): Promise<void> {
  const stored = await getStoredToken();
  if (stored && !isTokenExpired(stored)) return;
  await getConvexAuthToken();
}

export async function createAuthenticatedConvexClient(): Promise<ConvexHttpClient | null> {
  const token = await getConvexAuthToken();
  if (!token) return null;

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

export async function hasActiveClerkSession(): Promise<boolean> {
  return (await getConvexAuthToken()) !== null;
}
