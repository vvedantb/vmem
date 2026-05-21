import { createClerkClient } from "@clerk/chrome-extension/client";
import { ConvexHttpClient } from "convex/browser";
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_SYNC_HOST,
  CONVEX_URL,
} from "@/lib/constants";
import { getAuthToken, setAuthToken } from "@/lib/storage";

type ClerkClient = Awaited<ReturnType<typeof createClerkClient>>;

let clerkPromise: Promise<ClerkClient> | null = null;
let pendingRefresh: Promise<string | null> | null = null;

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

async function refreshTokenFromClerk(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      const clerk = await getClerk();
      const session = clerk.session;
      if (!session) {
        await setAuthToken("");
        return null;
      }

      const token = await session.getToken({ template: "convex" });
      await setAuthToken(token ?? "");
      return token ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[vmem] Background token refresh failed:", message);
      await setAuthToken("");
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

async function getConvexAuthToken(): Promise<string | null> {
  const stored = await getStoredToken();
  if (stored && !isTokenExpired(stored)) return stored;
  return refreshTokenFromClerk();
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
