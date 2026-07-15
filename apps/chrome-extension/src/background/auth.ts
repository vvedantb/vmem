import { ConvexHttpClient } from "convex/browser";
import { jwtDecode } from "jwt-decode";
import { CONVEX_URL } from "@/lib/constants";
import { getAuthToken, setAuthToken } from "@/lib/storage";
import { refreshConvexTokenFromClerk } from "@/lib/refresh-convex-token";

let pendingRefresh: Promise<string | null> | null = null;

async function getStoredToken(): Promise<string> {
  return getAuthToken();
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = jwtDecode(token);
    if (payload.exp === undefined) return true;
    return payload.exp * 1000 < Date.now() + 10_000;
  } catch {
    return true;
  }
}

// mint convex jwt in the service worker
async function refreshTokenFromClerk(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      const token = await refreshConvexTokenFromClerk();
      if (token) {
        await setAuthToken(token);
        return token;
      }

      // keep popup token if sync host cookie is missing
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
