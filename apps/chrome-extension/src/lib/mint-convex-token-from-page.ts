import { clerkFrontendApiHost, CLERK_PUBLISHABLE_KEY } from "@/lib/constants";
import {
  clerkConvexTokenUrl,
  convexJwtFromClerkResponse,
} from "@/lib/clerk-session-cookie";

export async function mintConvexTokenWithPageCookies(
  sessionId: string,
): Promise<string | null> {
  const frontendApiHost = clerkFrontendApiHost(CLERK_PUBLISHABLE_KEY);
  if (!frontendApiHost) return null;

  const urls = [
    clerkConvexTokenUrl(frontendApiHost, sessionId, { native: false }),
    clerkConvexTokenUrl(frontendApiHost, sessionId),
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) continue;
      const jwt = convexJwtFromClerkResponse(await response.json());
      if (jwt) return jwt;
    } catch {
      // try the next Clerk mint URL
    }
  }
  return null;
}
