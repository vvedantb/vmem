import { runLockedImportLoop, type ImportResult } from "./import-loop";
import { acquireHistoryLock, releaseHistoryLock } from "./sync-lock";
import { getSyncProfileId } from "./sync-profile";
import { getStorage, setStorage } from "@/lib/storage";

export type { ImportResult };

const SKIP_PREFIXES = ["chrome://", "chrome-extension://", "about:", "edge://"];

// import history since last sync, manual-sync can pass a day-lookback
export async function importHistory(
  days?: number,
  silent = false,
): Promise<ImportResult> {
  let profileId: string | undefined;

  return runLockedImportLoop({
    acquireLock: acquireHistoryLock,
    releaseLock: releaseHistoryLock,
    silent,
    persistSyncTimestamp: async () => {
      await setStorage({ lastHistorySync: Date.now() });
    },
    loadItems: async () => {
      const { lastHistorySync } = await getStorage();

      let startTime: number;
      if (days !== undefined) {
        const daysAgo = Date.now() - days * 24 * 60 * 60 * 1000;
        startTime = Math.max(daysAgo, lastHistorySync);
      } else if (lastHistorySync > 0) {
        startTime = lastHistorySync;
      } else {
        // first auto-sync only looks back 30 minutes
        startTime = Date.now() - 30 * 60 * 1000;
      }

      const entries = await chrome.history.search({
        text: "",
        maxResults: 1000,
        startTime,
      });

      const filtered = entries.filter((entry) => {
        if (!entry.url) return false;
        return !SKIP_PREFIXES.some((prefix) => entry.url?.startsWith(prefix));
      });

      const seen = new Set<string>();
      const deduplicated = filtered.filter((entry) => {
        if (!entry.url || seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      });

      profileId = await getSyncProfileId();
      return deduplicated;
    },
    toCreateParams: (entry) => {
      if (!entry.url) return null;
      const hostname = new URL(entry.url).hostname;
      return {
        title: entry.title || entry.url,
        content: `${entry.title || ""}\n${entry.url}\nVisited ${entry.visitCount ?? 1} times`,
        type: "episodic",
        source: "browsing-history",
        tags: [hostname],
        confidence: 0.6,
        url: entry.url,
        profileId,
      };
    },
  });
}
