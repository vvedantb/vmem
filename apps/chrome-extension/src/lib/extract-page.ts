/**
 * Helper for invoking the Readability content script that lives on every
 * page. Replaces the old `chrome.scripting.executeScript({ func })` pattern
 * because that path serializes the function — its imports get dropped, so
 * `@mozilla/readability` cannot be bundled in.
 */

import type { ExtractPageResult } from "@/content/readability";

export type { ExtractPageResult };

/**
 * Send an EXTRACT_PAGE message to the content script in `tabId` and return
 * the parsed page (Readability-extracted when possible, strip-list fallback
 * otherwise). Resolves to `null` when the content script is missing (e.g.
 * the page is a privileged URL such as chrome:// where content scripts
 * cannot run).
 */
export function extractPageFromTab(
  tabId: number,
): Promise<ExtractPageResult | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "EXTRACT_PAGE" },
      (response: ExtractPageResult | undefined) => {
        // chrome.runtime.lastError fires on privileged URLs / when the
        // content script is not loaded. We resolve null instead of
        // rejecting so callers can decide how to handle missing pages.
        if (chrome.runtime.lastError) {
          console.warn(
            "[vmem] EXTRACT_PAGE failed:",
            chrome.runtime.lastError.message,
          );
          resolve(null);
          return;
        }
        if (!response || response.type !== "EXTRACT_PAGE_RESULT") {
          resolve(null);
          return;
        }
        resolve(response);
      },
    );
  });
}
