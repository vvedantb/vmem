const OFFSCREEN_DOCUMENT_PATH = "offscreen/index.html";

let creating: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    return contexts.length > 0;
  }
  return false;
}

function waitForOffscreenReady(): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve();
    }, 5_000);

    function handler(message: unknown) {
      if (
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "type") === "OFFSCREEN_READY"
      ) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(handler);
        resolve();
      }
    }

    chrome.runtime.onMessage.addListener(handler);
  });
}

export async function ensureOffscreenDocument(): Promise<void> {
  const exists = await hasOffscreenDocument();
  if (exists) {
    return;
  }

  if (creating) {
    await creating;
    return;
  }

  const ready = waitForOffscreenReady();

  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification:
      "Run WebLLM inference for local memory enrichment using WebGPU",
  });

  try {
    await creating;
    console.log("[offscreen-manager] Offscreen document created");
    await ready;
    console.log("[offscreen-manager] Offscreen script ready");
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
