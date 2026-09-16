import { CLERK_COOKIE_SYNC_HOST, CLERK_SYNC_HOST } from "@/lib/constants";
import { errorMessage } from "@/lib/error";
import { warmBackgroundAuth } from "./auth";
import { catchUpHistorySyncIfOverdue } from "./sync-scheduler";

const DEV_SESSION_COOKIE = "__clerk_db_jwt";
const PROD_SESSION_COOKIE = "__client";

let listenerRegistered = false;

export function syncHostCookieDomain(syncHost: string): string {
  const hostname = new URL(syncHost).hostname;
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isSessionCookieOnSyncHost(
  cookie: Pick<chrome.cookies.Cookie, "name" | "domain">,
  syncHost: string,
): boolean {
  if (
    cookie.name !== DEV_SESSION_COOKIE &&
    cookie.name !== PROD_SESSION_COOKIE
  ) {
    return false;
  }

  const domain = cookie.domain.startsWith(".")
    ? cookie.domain.slice(1)
    : cookie.domain;
  const syncDomain = syncHostCookieDomain(syncHost);

  return domain === syncDomain || domain.endsWith(`.${syncDomain}`);
}

function isSyncHostSessionCookie(cookie: chrome.cookies.Cookie): boolean {
  return (
    isSessionCookieOnSyncHost(cookie, CLERK_COOKIE_SYNC_HOST) ||
    isSessionCookieOnSyncHost(cookie, CLERK_SYNC_HOST)
  );
}

function cookieDedupeKey(cookie: chrome.cookies.Cookie): string {
  return `${cookie.domain}|${cookie.path}|${cookie.partitionKey?.topLevelSite ?? ""}`;
}

async function listClientCookies(): Promise<chrome.cookies.Cookie[]> {
  const name = PROD_SESSION_COOKIE;
  const seen = new Map<string, chrome.cookies.Cookie>();
  const add = (cookies: chrome.cookies.Cookie[]) => {
    for (const cookie of cookies) {
      seen.set(cookieDedupeKey(cookie), cookie);
    }
  };

  add(await chrome.cookies.getAll({ name }));
  const partitionedQueries: chrome.cookies.CookiePartitionKey[] = [
    {},
    { topLevelSite: CLERK_SYNC_HOST },
    { topLevelSite: CLERK_SYNC_HOST, hasCrossSiteAncestor: true },
  ];
  for (const partitionKey of partitionedQueries) {
    try {
      add(await chrome.cookies.getAll({ name, partitionKey }));
    } catch {
      // older Chrome rejects empty or ancestor partition keys
    }
  }
  return [...seen.values()];
}

function sameSiteForSet(
  value: chrome.cookies.SameSiteStatus | undefined,
): chrome.cookies.SameSiteStatus {
  if (!value || value === "unspecified") return "lax";
  return value;
}

// Clerk JWTHandler uses cookies.get({ url: syncHost, name: "__client" }), which
// misses CHIPS-partitioned FAPI cookies. Copy the value into the unpartitioned
// host-only store so popup + SW can mint a Convex JWT.
export async function ensureUnpartitionedClerkClientCookie(
  source?: chrome.cookies.Cookie,
): Promise<boolean> {
  const url = `${CLERK_COOKIE_SYNC_HOST}/`;
  try {
    const visible = await chrome.cookies.get({
      url,
      name: PROD_SESSION_COOKIE,
    });
    if (visible?.value) return true;

    const fromEvent =
      source?.name === PROD_SESSION_COOKIE && source.value.length > 0
        ? source
        : undefined;
    const cookie =
      fromEvent ??
      (await listClientCookies()).find(
        (candidate) =>
          candidate.value.length > 0 && isSyncHostSessionCookie(candidate),
      );
    if (!cookie?.value) return false;

    const details: chrome.cookies.SetDetails = {
      url,
      name: PROD_SESSION_COOKIE,
      value: cookie.value,
      path: cookie.path || "/",
      secure: true,
      httpOnly: true,
      sameSite: sameSiteForSet(cookie.sameSite),
    };
    if (typeof cookie.expirationDate === "number") {
      details.expirationDate = cookie.expirationDate;
    }
    if (cookie.storeId) details.storeId = cookie.storeId;

    await chrome.cookies.set(details);

    const mirrored = await chrome.cookies.get({
      url,
      name: PROD_SESSION_COOKIE,
    });
    return Boolean(mirrored?.value);
  } catch (error) {
    console.warn(
      "[vmem] Could not expose Clerk __client cookie to syncHost:",
      errorMessage(error),
    );
    return false;
  }
}

async function warmAuthFromSyncHostCookie(
  source?: chrome.cookies.Cookie,
): Promise<void> {
  await ensureUnpartitionedClerkClientCookie(source);
  await warmBackgroundAuth();
  void catchUpHistorySyncIfOverdue();
}

// web sign-in updates syncHost cookies, warm auth so auto-sync works without popup
export function registerSyncHostCookieListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;

  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.removed) return;
    const cookie = changeInfo.cookie;
    if (!cookie) return;
    if (!isSyncHostSessionCookie(cookie)) return;

    void warmAuthFromSyncHostCookie(cookie);
  });
}
