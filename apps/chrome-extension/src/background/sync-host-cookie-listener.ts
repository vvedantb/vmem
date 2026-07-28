import { CLERK_SYNC_HOST } from "@/lib/constants";
import { warmBackgroundAuth } from "./auth";
import { catchUpHistorySyncIfOverdue } from "./sync-scheduler";

const DEV_SESSION_COOKIE = "__clerk_db_jwt";
const PROD_SESSION_COOKIE = "__client";

let listenerRegistered = false;

function syncHostCookieDomain(): string {
  const hostname = new URL(CLERK_SYNC_HOST).hostname;
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isSyncHostSessionCookie(cookie: chrome.cookies.Cookie): boolean {
  if (
    cookie.name !== DEV_SESSION_COOKIE &&
    cookie.name !== PROD_SESSION_COOKIE
  ) {
    return false;
  }

  const domain = cookie.domain.startsWith(".")
    ? cookie.domain.slice(1)
    : cookie.domain;
  const syncDomain = syncHostCookieDomain();

  return domain === syncDomain || domain.endsWith(`.${syncDomain}`);
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

    void (async () => {
      await warmBackgroundAuth();
      void catchUpHistorySyncIfOverdue();
    })();
  });
}
