import { createMemory } from "./api-client";
import { isCancelled, resetCancel } from "./import-cancel";
import { acquireHistoryLock, releaseHistoryLock } from "./sync-lock";
import { getStorage, setStorage } from "@/lib/storage";
import type { ImportResult } from "./import-bookmarks";

const SKIP_PREFIXES = ["chrome://", "chrome-extension://", "about:", "edge://"];

// Build a map of visitId → URL for referrer lookups
async function buildVisitMap(
  entries: chrome.history.HistoryItem[],
): Promise<Map<string, string>> {
  const visitMap = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.url) continue;
    try {
      const visits = await chrome.history.getVisits({ url: entry.url });
      for (const visit of visits) {
        visitMap.set(visit.visitId, entry.url);
      }
    } catch {
      // Skip if getVisits fails
    }
  }

  return visitMap;
}

// Get referrer URL for a history entry
async function getReferrerUrl(
  url: string,
  visitMap: Map<string, string>,
): Promise<string | undefined> {
  try {
    const visits = await chrome.history.getVisits({ url });
    // Get the most recent visit
    const latestVisit = visits[visits.length - 1];
    if (latestVisit?.referringVisitId) {
      return visitMap.get(latestVisit.referringVisitId);
    }
  } catch {
    // Ignore errors
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Import browsing history — only items since last sync.
 *
 * @param days  Manual sync: max lookback window (clamped to lastHistorySync).
 *              Omit for auto-sync: uses lastHistorySync directly.
 * @param silent  When true, skips sending IMPORT_PROGRESS messages (auto-sync, popup closed).
 */
export async function importHistory(
  days?: number,
  silent = false,
): Promise<ImportResult> {
  if (!acquireHistoryLock()) {
    return { imported: 0, locked: true };
  }

  try {
    resetCancel();
    const { lastHistorySync } = await getStorage();

    let startTime: number;
    if (days !== undefined) {
      // Manual sync: go back `days` but never earlier than last sync
      const daysAgo = Date.now() - days * 24 * 60 * 60 * 1000;
      startTime = Math.max(daysAgo, lastHistorySync);
    } else if (lastHistorySync > 0) {
      // Auto-sync: from last sync point
      startTime = lastHistorySync;
    } else {
      // First auto-sync tick, never synced — only look back 30 min to avoid huge fetch
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

    let imported = 0;
    let processed = 0;

    for (const entry of deduplicated) {
      if (isCancelled()) break;
      if (!entry.url) continue;

      try {
        const hostname = new URL(entry.url).hostname;
        const result = await createMemory({
          title: entry.title || entry.url,
          content: `${entry.title || ""}\n${entry.url}\nVisited ${entry.visitCount ?? 1} times`,
          type: "episodic",
          source: "browsing-history",
          tags: [hostname],
          confidence: 0.6,
          url: entry.url,
        });

        processed++;
        if (result.status === "created") {
          imported++;
        }

        if (!silent) {
          chrome.runtime.sendMessage({
            type: "IMPORT_PROGRESS",
            current: processed,
            total: deduplicated.length,
          });
        }
      } catch {
        // skip failed entries, continue importing
      }

      await delay(100);
    }

    if (!isCancelled()) {
      await setStorage({ lastHistorySync: Date.now() });
    }
    return { imported, locked: false };
  } finally {
    releaseHistoryLock();
  }
}
