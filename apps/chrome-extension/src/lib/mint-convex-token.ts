import { clerkFrontendApiHost, CLERK_PUBLISHABLE_KEY } from "@/lib/constants";
import {
  clerkConvexTokenUrl,
  clerkSessionIdFromJwt,
  convexJwtFromClerkResponse,
} from "@/lib/clerk-session-cookie";
import { errorMessage } from "@/lib/error";

export async function mintConvexTokenFromSessionJwt(
  sessionJwt: string,
): Promise<string | null> {
  const sessionId = clerkSessionIdFromJwt(sessionJwt);
  const frontendApiHost = clerkFrontendApiHost(CLERK_PUBLISHABLE_KEY);
  if (!sessionId || !frontendApiHost) return null;

  try {
    const response = await fetch(
      clerkConvexTokenUrl(frontendApiHost, sessionId),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionJwt}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    if (!response.ok) {
      console.warn(
        "[vmem] Clerk convex token HTTP",
        response.status,
        response.statusText,
      );
      return null;
    }
    const raw: unknown = await response.json();
    return convexJwtFromClerkResponse(raw);
  } catch (error) {
    console.warn(
      "[vmem] Clerk convex token fetch failed:",
      errorMessage(error),
    );
    return null;
  }
}
