/** ask the page's readability content script for extracted html/text. */

import type { ExtractPageResult } from "@/content/readability";

export type { ExtractPageResult };

/** returns null on privileged urls where content scripts can't run. */
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
        // rejecting so callers can decide how to handle missing pages
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
