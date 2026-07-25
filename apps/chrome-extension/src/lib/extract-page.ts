// ask the page's readability content script for extracted html/text

import { sendMessage, type ExtractPageData } from "@/lib/messaging";

export type { ExtractPageData };

// returns null on privileged urls where content scripts can't run
export async function extractPageFromTab(
  tabId: number,
): Promise<ExtractPageData | null> {
  try {
    return await sendMessage("extractPage", undefined, tabId);
  } catch (err) {
    console.warn(
      "[vmem] extractPage failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
