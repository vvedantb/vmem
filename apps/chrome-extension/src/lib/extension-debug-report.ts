import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from "@/lib/constants";

type DebugReport = {
  generatedAt: string;
  extensionVersion: string;
  swBootAt: number | null;
  swBootPhase: string | null;
  swBootError: string | null;
  swLastMessageError: string | null;
  pingOk: boolean;
  pingError: string | null;
  syncHostCookiePresent: boolean;
  lastHistorySync: number;
  lastBookmarkSync: number;
  lastSyncAttemptAt: number;
  lastSyncSkipReason: string;
  autoSyncEnabled: boolean;
  swBuildStamp: string | null;
  /** Breadcrumbs from the most recent Clerk token refresh (see refresh-convex-token.ts). */
  lastAuthDebug: Record<string, string | number> | null;
};

async function hasSyncHostSessionCookie(): Promise<boolean> {
  const cookieName = CLERK_PUBLISHABLE_KEY.startsWith("pk_live_")
    ? "__client"
    : "__clerk_db_jwt";
  const cookie = await chrome.cookies.get({
    url: CLERK_SYNC_HOST,
    name: cookieName,
  });
  return Boolean(cookie?.value);
}

export async function buildExtensionDebugReport(): Promise<DebugReport> {
  const manifest = chrome.runtime.getManifest();
  const stored = await chrome.storage.local.get([
    "vmemSwBootAt",
    "vmemSwBootPhase",
    "vmemSwBootError",
    "vmemSwLastMessageError",
    "lastHistorySync",
    "lastBookmarkSync",
    "lastSyncAttemptAt",
    "lastSyncSkipReason",
    "autoSyncEnabled",
    "vmemSwBuildStamp",
    "lastAuthDebug",
  ]);

  const syncHostCookiePresent = await hasSyncHostSessionCookie();

  // Narrow the untyped storage value to a flat string/number record.
  let authDebug: Record<string, string | number> | null = null;
  if (
    typeof stored.lastAuthDebug === "object" &&
    stored.lastAuthDebug !== null
  ) {
    authDebug = {};
    for (const [k, v] of Object.entries(stored.lastAuthDebug)) {
      if (typeof v === "string" || typeof v === "number") authDebug[k] = v;
    }
  }

  const pingResult = await new Promise<{
    ok: boolean;
    error: string | null;
  }>((resolve) => {
    chrome.runtime.sendMessage({ type: "DEBUG_PING" }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        const message = runtimeError.message;
        resolve({
          ok: false,
          error: message === undefined ? "runtime error" : message,
        });
        return;
      }
      const responseType =
        typeof response === "object" && response !== null
          ? Reflect.get(response, "type")
          : undefined;
      resolve({
        ok: responseType === "DEBUG_PING_RESULT",
        error:
          responseType === "DEBUG_PING_RESULT" ? null : "unexpected response",
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    extensionVersion: manifest.version,
    swBootAt:
      typeof stored.vmemSwBootAt === "number" ? stored.vmemSwBootAt : null,
    swBootPhase:
      typeof stored.vmemSwBootPhase === "string"
        ? stored.vmemSwBootPhase
        : null,
    swBootError:
      typeof stored.vmemSwBootError === "string"
        ? stored.vmemSwBootError
        : null,
    swLastMessageError:
      typeof stored.vmemSwLastMessageError === "string"
        ? stored.vmemSwLastMessageError
        : null,
    pingOk: pingResult.ok,
    pingError: pingResult.error,
    syncHostCookiePresent,
    lastHistorySync:
      typeof stored.lastHistorySync === "number" ? stored.lastHistorySync : 0,
    lastBookmarkSync:
      typeof stored.lastBookmarkSync === "number" ? stored.lastBookmarkSync : 0,
    lastSyncAttemptAt:
      typeof stored.lastSyncAttemptAt === "number"
        ? stored.lastSyncAttemptAt
        : 0,
    lastSyncSkipReason:
      typeof stored.lastSyncSkipReason === "string"
        ? stored.lastSyncSkipReason
        : "",
    autoSyncEnabled: stored.autoSyncEnabled === true,
    swBuildStamp:
      typeof stored.vmemSwBuildStamp === "string"
        ? stored.vmemSwBuildStamp
        : null,
    lastAuthDebug: authDebug,
  };
}

export function formatExtensionDebugReport(report: DebugReport): string {
  return JSON.stringify(report, null, 2);
}
