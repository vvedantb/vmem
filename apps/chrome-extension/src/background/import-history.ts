import { createMemory } from "./api-client";

const SKIP_PREFIXES = ["chrome://", "chrome-extension://", "about:", "edge://"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function importHistory(days: number): Promise<number> {
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

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

  for (const entry of deduplicated) {
    if (!entry.url) continue;

    try {
      const hostname = new URL(entry.url).hostname;
      await createMemory({
        title: entry.title || entry.url,
        content: `${entry.title || ""}\n${entry.url}\nVisited ${entry.visitCount ?? 1} times`,
        type: "episodic",
        source: "browsing-history",
        tags: [hostname],
        confidence: 0.6,
      });
      imported++;

      chrome.runtime.sendMessage({
        type: "IMPORT_PROGRESS",
        current: imported,
        total: deduplicated.length,
      });
    } catch {
      // skip failed entries, continue importing
    }

    await delay(100);
  }

  return imported;
}
