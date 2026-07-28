// ask the page readability content-script for extracted html and text

import { sendMessage, type ExtractPageData } from "@/lib/messaging";
import { errorMessage } from "@/lib/error";

// privileged urls block content-scripts
export async function extractPageFromTab(
  tabId: number,
): Promise<ExtractPageData | null> {
  try {
    return await sendMessage("extractPage", undefined, tabId);
  } catch (err) {
    console.warn("[vmem] extractPage failed:", errorMessage(err));
    return null;
  }
}
