// save and remove for site scripts that follow a site's own "keep" control

import { sendMessage, type SiteItem, type SiteItemRef } from "@/lib/messaging";
import { showToast } from "@/content/shared/toast";
import { errorMessage } from "@/lib/error";

const MAX_CONTENT_LENGTH = 12000;

function showFailure(action: string, err: unknown): void {
  const reason = errorMessage(err);
  console.error(`[vmem] Failed to ${action}:`, reason);
  showToast({ type: "error", message: reason });
}

// read can fetch; a null item means the page has nothing to save
export async function saveSiteItem(
  read: () => SiteItem | null | Promise<SiteItem | null>,
): Promise<void> {
  try {
    const item = await read();
    if (!item) return;
    const { alreadySaved, memoryUrl } = await sendMessage("saveSiteItem", {
      ...item,
      content: item.content.slice(0, MAX_CONTENT_LENGTH),
    });
    showToast({
      type: "success",
      message: alreadySaved ? "Already saved" : "Saved to vmem",
      openUrl: memoryUrl,
    });
  } catch (err) {
    showFailure("save", err);
  }
}

export async function removeSiteItem(
  read: () => SiteItemRef | null,
): Promise<void> {
  try {
    const ref = read();
    if (!ref) return;
    const { removed } = await sendMessage("removeSiteItem", ref);
    if (removed) showToast({ type: "success", message: "Removed from vmem" });
  } catch (err) {
    showFailure("remove", err);
  }
}
