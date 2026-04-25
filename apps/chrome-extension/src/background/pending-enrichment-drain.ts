import { getStorage } from "@/lib/storage";
import {
  applyEnrichment,
  getMemory,
  listPendingEnrichment,
  listRecentMemoryTitlesForEnrichment,
  removePendingEnrichment,
} from "./api-client";
import { enrichMemory, getEnrichmentStatus } from "./enrichment-router";

const DRAIN_CAP = 50;

let draining = false;

export async function drainPendingEnrichmentQueue(): Promise<void> {
  if (draining) return;
  const { authToken, localEnrichmentEnabled } = await getStorage();
  if (!authToken) return;
  if (localEnrichmentEnabled === false) return;

  const status = await getEnrichmentStatus();
  if (!status.method || !status.modelLoaded) return;

  draining = true;
  try {
    let rows: Awaited<ReturnType<typeof listPendingEnrichment>>;
    try {
      rows = await listPendingEnrichment(DRAIN_CAP);
    } catch {
      return;
    }
    for (const row of rows) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      try {
        const mem = await getMemory(row.memoryId);
        if (mem === null) {
          await removePendingEnrichment(row.memoryId);
          continue;
        }
        const existing = await listRecentMemoryTitlesForEnrichment(
          row.memoryId,
        );
        const result = await enrichMemory(mem.title, mem.content, existing);
        if (result && result.tags.length > 0) {
          await applyEnrichment(
            row.memoryId,
            result.tags,
            result.relatedMemoryIds,
            result.entities,
          );
          await removePendingEnrichment(row.memoryId);
        }
      } catch (err) {
        console.error("[pending-drain] item failed:", err);
      }
    }
  } finally {
    draining = false;
  }
}
