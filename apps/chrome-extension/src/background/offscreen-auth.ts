const OFFSCREEN_URL = "offscreen.html";

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification:
      "Refresh Clerk session for background bookmark and history sync",
  });
}

export async function refreshConvexTokenViaOffscreen(): Promise<string | null> {
  await ensureOffscreenDocument();
  const response: { token: string | null } | undefined =
    await chrome.runtime.sendMessage({ type: "REFRESH_CONVEX_TOKEN" });
  return response?.token ?? null;
}
