import { createClerkClient } from "@clerk/chrome-extension/client";
import { ConvexHttpClient } from "convex/browser";
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_SYNC_HOST,
  CONVEX_URL,
} from "@/lib/constants";
import { getStorage, setStorage } from "@/lib/storage";

function createBackgroundClerkClient() {
  return createClerkClient({
    publishableKey: CLERK_PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    background: true,
  });
}

let clerkClientPromise: ReturnType<typeof createBackgroundClerkClient> | null =
  null;

function getClerkClient(): ReturnType<typeof createBackgroundClerkClient> {
  if (!clerkClientPromise) {
    clerkClientPromise = createBackgroundClerkClient();
  }
  return clerkClientPromise;
}

async function getConvexAuthToken(): Promise<string | null> {
  if (typeof window !== "undefined") {
    const { authToken } = await getStorage();
    return authToken || null;
  }

  try {
    const clerk = await getClerkClient();
    const session = clerk.session;
    if (!session) {
      await setStorage({ authToken: "" });
      return null;
    }

    const token = await session.getToken({ template: "convex" });
    if (!token) {
      await setStorage({ authToken: "" });
      return null;
    }

    await setStorage({ authToken: token });
    return token;
  } catch (error) {
    clerkClientPromise = null;
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[vmem] Failed to refresh Clerk auth token:", message);
    return null;
  }
}

export async function createAuthenticatedConvexClient(): Promise<ConvexHttpClient | null> {
  const token = await getConvexAuthToken();
  if (!token) {
    return null;
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

export async function hasActiveClerkSession(): Promise<boolean> {
  return (await getConvexAuthToken()) !== null;
}
