import { z } from "zod";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

const DEV_SESSION_COOKIE = "__clerk_db_jwt";
const PROD_SESSION_COOKIE = "__client";

/** Clerk Frontend API origin derived from the publishable key (pk_*_<base64(host)$>). */
function clerkFrontendApiOrigin(): string {
  const encoded = CLERK_PUBLISHABLE_KEY.split("_")[2] ?? "";
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const decoded = atob(padded);
  return `https://${decoded.endsWith("$") ? decoded.slice(0, -1) : decoded}`;
}

/**
 * Breadcrumbs from the most recent token refresh, persisted to
 * chrome.storage.local (key `lastAuthDebug`). Auth failures here are
 * otherwise invisible — a missing cookie, a rejected FAPI call, and a
 * signed-out user all look like "no-session" to the sync scheduler. Same
 * philosophy as recordSyncAttempt: a gap must be diagnosable from storage.
 */
type AuthDebug = {
  at: number;
  stage:
    | "no-cookies-api"
    | "cookie-missing"
    | "client-fetch-failed"
    | "no-session"
    | "token-fetch-failed"
    | "ok"
    | "threw";
  cookieLen: number;
  httpStatus?: number;
  error?: string;
};

async function recordAuthDebug(debug: Omit<AuthDebug, "at">): Promise<void> {
  const entry: AuthDebug = { at: Date.now(), ...debug };
  await chrome.storage.local.set({ lastAuthDebug: entry }).catch(() => {});
}

const fapiClientResponseSchema = z.object({
  response: z
    .object({
      sessions: z
        .array(
          z.object({
            id: z.string(),
            status: z.string(),
          }),
        )
        .optional(),
      last_active_session_id: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const fapiTokenResponseSchema = z.object({
  jwt: z.string().nullable().optional(),
});

/**
 * Mint a Convex JWT against Clerk's Frontend API directly, using the
 * syncHost session cookie. This is the same two-request flow clerk-js
 * performs (resolve client → create session token), hand-rolled because
 * clerk-js CANNOT run in a service worker: its `isValidBrowserOnline`
 * check requires `window`, so every SW is treated as permanently offline
 * and `session.getToken()` throws `clerk_offline` even when the network
 * is fine. Do not reintroduce `@clerk/chrome-extension`/clerk-js here.
 *
 * MUST run in a context that has the chrome.cookies API (the background
 * service worker or an extension page). Offscreen documents do NOT have
 * it — guard explicitly so a wrong context fails loudly.
 *
 * Dev instances (pk_test) authenticate FAPI calls with the __clerk_db_jwt
 * value as a query param; prod instances (pk_live) send the __client JWT
 * as a Bearer header with _is_native=1.
 */
export async function refreshConvexTokenFromClerk(): Promise<string | null> {
  if (typeof chrome === "undefined" || chrome.cookies === undefined) {
    console.warn(
      "[vmem] Clerk token refresh skipped — chrome.cookies is unavailable " +
        "in this context, so the syncHost session cookie cannot be read.",
    );
    await recordAuthDebug({ stage: "no-cookies-api", cookieLen: 0 });
    return null;
  }

  const isProd = CLERK_PUBLISHABLE_KEY.startsWith("pk_live_");
  const cookie = await chrome.cookies.get({
    url: CLERK_SYNC_HOST,
    name: isProd ? PROD_SESSION_COOKIE : DEV_SESSION_COOKIE,
  });
  const sessionJwt = cookie?.value ?? "";
  const cookieLen = sessionJwt.length;
  if (!sessionJwt) {
    await recordAuthDebug({ stage: "cookie-missing", cookieLen: 0 });
    return null;
  }

  const fapi = clerkFrontendApiOrigin();
  const authQuery = isProd
    ? "_is_native=1"
    : `__clerk_db_jwt=${encodeURIComponent(sessionJwt)}`;
  const authHeaders: HeadersInit = isProd
    ? { Authorization: `Bearer ${sessionJwt}` }
    : {};

  try {
    const clientRes = await fetch(
      `${fapi}/v1/client?${authQuery}&_clerk_js_version=5.0.0`,
      { method: "GET", headers: authHeaders, credentials: "omit" },
    );
    if (!clientRes.ok) {
      await recordAuthDebug({
        stage: "client-fetch-failed",
        cookieLen,
        httpStatus: clientRes.status,
      });
      return null;
    }
    const clientRaw: unknown = await clientRes.json();
    const clientParsed = fapiClientResponseSchema.safeParse(clientRaw);
    if (!clientParsed.success) {
      await recordAuthDebug({ stage: "client-fetch-failed", cookieLen });
      return null;
    }
    const clientJson = clientParsed.data;
    const sessions = clientJson.response?.sessions ?? [];
    const lastActiveId = clientJson.response?.last_active_session_id;
    const session =
      sessions.find((s) => s.id === lastActiveId && s.status === "active") ??
      sessions.find((s) => s.status === "active");
    if (!session) {
      await recordAuthDebug({ stage: "no-session", cookieLen });
      return null;
    }

    const tokenRes = await fetch(
      `${fapi}/v1/client/sessions/${session.id}/tokens/convex?${authQuery}&_clerk_js_version=5.0.0`,
      { method: "POST", headers: authHeaders, credentials: "omit" },
    );
    if (!tokenRes.ok) {
      await recordAuthDebug({
        stage: "token-fetch-failed",
        cookieLen,
        httpStatus: tokenRes.status,
      });
      return null;
    }
    const tokenRaw: unknown = await tokenRes.json();
    const tokenParsed = fapiTokenResponseSchema.safeParse(tokenRaw);
    if (!tokenParsed.success) {
      await recordAuthDebug({
        stage: "token-fetch-failed",
        cookieLen,
        httpStatus: tokenRes.status,
      });
      return null;
    }
    const tokenJson = tokenParsed.data;
    const token = tokenJson.jwt ?? null;
    await recordAuthDebug({
      stage: token ? "ok" : "token-fetch-failed",
      cookieLen,
      httpStatus: tokenRes.status,
    });
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAuthDebug({
      stage: "threw",
      cookieLen,
      error: message.slice(0, 300),
    });
    throw error;
  }
}
