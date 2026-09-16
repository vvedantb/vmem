import { jwtDecode } from "jwt-decode";
import { z } from "zod";

const sessionJwtPayloadSchema = z.object({
  sid: z.string().min(1),
});

const clerkJwtResponseSchema = z.object({
  jwt: z.string().min(20),
});

export function readSessionJwtFromCookieHeader(
  cookieHeader: string,
): string | null {
  let fallback: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!value) continue;
    if (name === "__session") return decodeURIComponent(value);
    if (name.startsWith("__session_") && !fallback) {
      fallback = decodeURIComponent(value);
    }
  }
  return fallback;
}

export function clerkSessionIdFromJwt(jwt: string): string | null {
  try {
    const parsed = sessionJwtPayloadSchema.safeParse(jwtDecode(jwt));
    return parsed.success ? parsed.data.sid : null;
  } catch {
    return null;
  }
}

export function clerkConvexTokenUrl(
  frontendApiHost: string,
  sessionId: string,
  options?: { native?: boolean },
): string {
  const url = new URL(
    `https://${frontendApiHost}/v1/client/sessions/${sessionId}/tokens/convex`,
  );
  if (options?.native !== false) {
    url.searchParams.set("_is_native", "1");
  }
  return url.toString();
}

export function convexJwtFromClerkResponse(payload: unknown): string | null {
  const parsed = clerkJwtResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.jwt : null;
}
