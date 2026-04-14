/**
 * Offscreen document lifecycle manager.
 * Creates the offscreen document on-demand for WebLLM inference.
 *
 * Chrome allows only ONE offscreen document at a time per extension.
 * The document is created lazily and destroyed after idle timeout.
 */

const OFFSCREEN_DOCUMENT_PATH = "offscreen/index.html";

// Track if we're currently creating the document (to prevent race conditions)
let creating: Promise<void> | null = null;

/**
 * Check if the offscreen document already exists.
 */
async function hasOffscreenDocument(): Promise<boolean> {
  // Chrome 109+ has chrome.offscreen.hasDocument()
  // But it was removed/renamed in later versions, so we use getContexts() instead
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    return contexts.length > 0;
  }

  // Fallback: try to query for offscreen documents
  // This shouldn't be needed on modern Chrome versions
  return false;
}

/**
 * Ensure the offscreen document is created.
 * Safe to call multiple times - will only create once.
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // Check if already exists
  const exists = await hasOffscreenDocument();
  if (exists) {
    return;
  }

  // Check if we're already creating it
  if (creating) {
    await creating;
    return;
  }

  // Create the offscreen document
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification:
      "Run WebLLM inference for local memory enrichment using WebGPU",
  });

  try {
    await creating;
    console.log("[offscreen-manager] Offscreen document created");
  } finally {
    creating = null;
  }
}

/**
 * Close the offscreen document to free resources.
 */
export async function closeOffscreenDocument(): Promise<void> {
  const exists = await hasOffscreenDocument();
  if (!exists) {
    return;
  }

  await chrome.offscreen.closeDocument();
  console.log("[offscreen-manager] Offscreen document closed");
}

/**
 * Send a message to the offscreen document and wait for response.
 */
export async function sendToOffscreen<T>(message: unknown): Promise<T> {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
