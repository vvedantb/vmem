/**
 * Safe wrapper for chrome.runtime.sendMessage.
 *
 * Content scripts can outlive the extension context (e.g. after extension
 * reload/update). When this happens, `chrome.runtime` becomes undefined and
 * calling `sendMessage` throws:
 *   "Cannot read properties of undefined (reading 'sendMessage')"
 *
 * This wrapper catches that case and returns undefined instead of crashing.
 */

type SendMessageCallback<T> = (response: T | undefined) => void;

/**
 * Check if the extension context is still valid.
 * Returns false when the extension has been reloaded/updated and this
 * content script is orphaned.
 */
function isExtensionContextValid(): boolean {
  try {
    // chrome.runtime.id is undefined when the context is invalidated
    return (
      typeof chrome !== "undefined" &&
      typeof chrome.runtime !== "undefined" &&
      typeof chrome.runtime.id === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Send a message to the background script, safely handling invalidated
 * extension contexts. Returns undefined if the extension context is gone.
 */
export function safeSendMessage<TResponse>(
  message: unknown,
  callback: SendMessageCallback<TResponse>,
): void {
  if (!isExtensionContextValid()) {
    console.warn(
      "[vmem] Extension context invalidated — unable to send message. " +
        "Reload the page to reconnect.",
    );
    callback(undefined);
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response: TResponse | undefined) => {
      // Check for runtime errors (e.g. "Extension context invalidated")
      if (chrome.runtime.lastError) {
        console.warn(
          "[vmem] sendMessage error:",
          chrome.runtime.lastError.message,
        );
        callback(undefined);
        return;
      }
      callback(response);
    });
  } catch (err) {
    console.warn("[vmem] Failed to send message:", err);
    callback(undefined);
  }
}
