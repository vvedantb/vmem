/** chrome.runtime.sendMessage that no-ops when the extension context is dead. */

type SendMessageCallback<T> = (response: T | undefined) => void;

/** false when this content script is orphaned after extension reload. */
function isExtensionContextValid(): boolean {
  try {
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
