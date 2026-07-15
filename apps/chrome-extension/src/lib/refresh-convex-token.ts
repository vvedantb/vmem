import { z } from "zod";
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

const DEV_SESSION_COOKIE = "__clerk_db_jwt";
const PROD_SESSION_COOKIE = "__client";

// clerk fapi origin from publishable key (pk_*_<base64(host)$>)
function clerkFrontendApiOrigin(): string {
  const encoded = CLERK_PUBLISHABLE_KEY.split("_")[2] ?? "";
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const decoded = atob(padded);
  return `https://${decoded.endsWith("$") ? decoded.slice(0, -1) : decoded}`;
}

// last auth attempt breadcrumbs for popup/debug (key: lastAuthDebug)
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

// mint convex jwt via clerk fapi + syncHost cookie (clerk js can't run in sw)
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
