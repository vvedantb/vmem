import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "@/lib/constants";
import { getAuthToken, setAuthToken } from "@/lib/storage";

const OFFSCREEN_PATH = "offscreen/offscreen.html";
const REFRESH_TIMEOUT_MS = 60_000;
const OFFSCREEN_READY_TIMEOUT_MS = 45_000;
const REFRESH_MAX_ATTEMPTS = 3;

// Module-level guard so concurrent sync ticks share one refresh.
let pendingRefresh: Promise<string | null> | null = null;

/**
 * Read the token cached by the popup (TokenSync) or by an offscreen
 * refresh. Returns "" when no token is stored.
 */
async function getStoredToken(): Promise<string> {
  return getAuthToken();
}

/**
 * Inspect the JWT `exp` claim. Returns true when expired, malformed, or
 * within the 10s safety margin — caller should refresh.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 < Date.now() + 10_000;
  } catch {
    return true;
  }
}

/**
 * Service workers have no DOM, so they can't run Clerk. The offscreen
 * document is the standard Chrome MV3 escape hatch — it provides a real
 * window/document where Clerk can sync cookies from the dev-instance
 * syncHost and mint a Convex token, then writes it into chrome.storage.
 *
 * Returns the refreshed token, or null when no Clerk session is available
 * (user signed out, or dev syncHost not yet authenticated).
 */
async function refreshTokenViaOffscreen(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    try {
      await ensureOffscreenDocument();

      for (let attempt = 1; attempt <= REFRESH_MAX_ATTEMPTS; attempt++) {
        try {
          const response = await sendOffscreenMessage();
          if (response.token) {
            await setAuthToken(response.token);
            return response.token;
          }
          await setAuthToken("");
          return null;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (attempt === REFRESH_MAX_ATTEMPTS) {
            console.warn("[vmem] Offscreen token refresh failed:", message);
            return null;
          }
          console.warn(
            `[vmem] Offscreen token refresh attempt ${attempt} failed, retrying:`,
            message,
          );
          await delay(500 * attempt);
        }
      }
      return null;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;

  const readyPromise = waitForOffscreenReady();
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification:
      "Run Clerk in a DOM context to refresh the Convex auth token for periodic background sync.",
  });
  await readyPromise;
}

function waitForOffscreenReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error("Offscreen document ready timeout"));
    }, OFFSCREEN_READY_TIMEOUT_MS);

    function listener(message: { type?: string } | undefined): void {
      if (message?.type !== "OFFSCREEN_READY") return;
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timer);
      resolve();
    }

    chrome.runtime.onMessage.addListener(listener);
  });
}

interface OffscreenTokenResponse {
  token: string | null;
}

function sendOffscreenMessage(): Promise<OffscreenTokenResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Offscreen token refresh timed out"));
    }, REFRESH_TIMEOUT_MS);

    chrome.runtime.sendMessage(
      { type: "OFFSCREEN_REFRESH_TOKEN" },
      (response: OffscreenTokenResponse | undefined) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? "send failed"));
          return;
        }
        resolve(response ?? { token: null });
      },
    );
  });
}

/**
 * Returns a Convex-ready token. Storage is fed by the popup's TokenSync
 * while open; once the popup closes the token expires quickly, so we
 * fall back to an offscreen refresh.
 */
async function getConvexAuthToken(): Promise<string | null> {
  const stored = await getStoredToken();
  if (stored && !isTokenExpired(stored)) return stored;
  return refreshTokenViaOffscreen();
}

export async function warmBackgroundAuth(): Promise<void> {
  const stored = await getStoredToken();
  if (stored && !isTokenExpired(stored)) return;
  await getConvexAuthToken();
}

export async function createAuthenticatedConvexClient(): Promise<ConvexHttpClient | null> {
  const token = await getConvexAuthToken();
  if (!token) return null;

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

export async function hasActiveClerkSession(): Promise<boolean> {
  return (await getConvexAuthToken()) !== null;
}
