import { browseParts, sanitizeTag } from "@vmem/shared";
import { runLockedImportLoop, type ImportResult } from "./import-loop";
import { acquireHistoryLock, releaseHistoryLock } from "./sync-lock";
import { getSyncProfileId } from "./sync-profile";
import { getStorage, setStorage } from "@/lib/storage";
import type { CreateMemoryParams } from "@/types/api";

export type { ImportResult };

const SKIP_HISTORY_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "about:",
  "edge://",
] as const;

export function isImportableHistoryUrl(url: string): boolean {
  return !SKIP_HISTORY_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

type HistoryEntry = Pick<chrome.history.HistoryItem, "url" | "title">;

// one item per browseKey; chrome returns newest first, so the latest url wins
export function dedupeHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.url || !isImportableHistoryUrl(entry.url)) return false;
    const key = browseParts({ url: entry.url, title: entry.title }).key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// content uses only the key's stable parts, so a revisit sends identical
// title+content and the backend upsert just bumps visitCount
export function historyEntryToCreateParams(
  entry: HistoryEntry,
  profileId: string | undefined,
): CreateMemoryParams | null {
  if (!entry.url) return null;
  const parts = browseParts({ url: entry.url, title: entry.title });
  const [title, content] =
    parts.kind === "title"
      ? [parts.title, `${parts.title}\n${parts.host}`]
      : [parts.canonicalUrl, parts.canonicalUrl];
  return {
    title,
    content,
    type: "episodic",
    source: "browsing-history",
    sourceType: "browsing-history",
    externalId: parts.key,
    tags: parts.host ? [sanitizeTag(parts.host)] : [],
    confidence: 0.6,
    url: entry.url,
    profileId,
  };
}

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

      profileId = await getSyncProfileId();
      return dedupeHistoryEntries(entries);
    },
    toCreateParams: (entry) => historyEntryToCreateParams(entry, profileId),
  });
}
