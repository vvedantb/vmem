import { CLERK_SYNC_HOST } from "@/lib/constants";
import { errorMessage } from "@/lib/error";
import { setAuthToken } from "@/lib/storage";

export type HarvestResult = {
  ok: boolean;
  reason: string;
};

type ClerkTokenProbe = {
  ok: boolean;
  reason: string;
  token?: string;
};

type ClerkGetToken = (opts: { template: string }) => Promise<string | null>;

type ClerkSessionLike = {
  getToken: ClerkGetToken;
};

type ClerkLike = {
  session?: ClerkSessionLike | null;
};

declare global {
  // MAIN-world Clerk on the signed-in vmem tab
  var Clerk: ClerkLike | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isWebAppSyncUrl(
  url: string | undefined,
  syncHost: string = CLERK_SYNC_HOST,
): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === new URL(syncHost).origin;
  } catch {
    return false;
  }
}

// injected into the vmem tab MAIN world; must not close over module scope
async function readConvexTokenFromPage(): Promise<ClerkTokenProbe> {
  const clerk = globalThis.Clerk;
  if (!clerk) return { ok: false, reason: "no-clerk" };
  if (!clerk.session) return { ok: false, reason: "no-session" };
  try {
    const token = await clerk.session.getToken({ template: "convex" });
    if (!token) return { ok: false, reason: "empty-token" };
    return { ok: true, reason: "ok", token };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function harvestConvexTokenFromTab(
  tabId: number,
): Promise<HarvestResult> {
  if (typeof chrome.scripting?.executeScript !== "function") {
    return { ok: false, reason: "no-scripting-api" };
  }
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: readConvexTokenFromPage,
    });
    const probe = injected[0]?.result;
    if (!probe) return { ok: false, reason: "no-inject-result" };
    if (!probe.ok || !probe.token) {
      return { ok: false, reason: probe.reason };
    }
    await setAuthToken(probe.token);
    return { ok: true, reason: "harvested" };
  } catch (err) {
    return { ok: false, reason: errorMessage(err) };
  }
}

export async function harvestConvexTokenFromTabWithRetry(
  tabId: number,
  attempts = 10,
  delayMs = 400,
): Promise<HarvestResult> {
  let last: HarvestResult = { ok: false, reason: "not-attempted" };
  for (let i = 0; i < attempts; i++) {
    last = await harvestConvexTokenFromTab(tabId);
    if (last.ok) return last;
    await sleep(delayMs);
  }
  return last;
}

export async function harvestConvexTokenFromOpenVmemTabs(): Promise<HarvestResult> {
  if (typeof chrome.tabs?.query !== "function") {
    return { ok: false, reason: "no-tabs-api" };
  }
  const tabs = await chrome.tabs.query({});
  let last: HarvestResult = { ok: false, reason: "no-vmem-tab" };
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !isWebAppSyncUrl(tab.url)) continue;
    last = await harvestConvexTokenFromTabWithRetry(tab.id);
    if (last.ok) return last;
  }
  return last;
}

let tabListenerRegistered = false;

export function registerWebClerkTokenHarvest(): void {
  if (tabListenerRegistered) return;
  if (typeof chrome.tabs?.onUpdated?.addListener !== "function") return;
  tabListenerRegistered = true;

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== "complete") return;
    if (!isWebAppSyncUrl(tab.url)) return;
    void harvestConvexTokenFromTabWithRetry(tabId);
  });
}
