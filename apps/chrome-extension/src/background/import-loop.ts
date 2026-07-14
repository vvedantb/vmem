import { createMemory } from "./api-client";
import type { CreateMemoryParams } from "@/types/api";
import { isCancelled, resetCancel } from "./import-cancel";

const IMPORT_ITEM_DELAY_MS = 100;

export interface ImportResult {
  imported: number;
  locked: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared lock + cancel + createMemory loop for bookmark/history imports.
 * Keeps progress messaging and per-item delay identical across both paths.
 */
export async function runLockedImportLoop<T>(options: {
  acquireLock: () => boolean;
  releaseLock: () => void;
  silent: boolean;
  loadItems: () => Promise<T[]>;
  toCreateParams: (item: T) => CreateMemoryParams | null;
  persistSyncTimestamp: () => Promise<void>;
}): Promise<ImportResult> {
  if (!options.acquireLock()) {
    return { imported: 0, locked: true };
  }

  try {
    resetCancel();
    const items = await options.loadItems();
    let imported = 0;
    let processed = 0;

    for (const item of items) {
      if (isCancelled()) break;

      try {
        const params = options.toCreateParams(item);
        if (!params) continue;

        const result = await createMemory(params);
        processed++;
        if (result.status === "created") {
          imported++;
        }

        if (!options.silent) {
          void chrome.runtime.sendMessage({
            type: "IMPORT_PROGRESS",
            current: processed,
            total: items.length,
          });
        }
      } catch {
        // skip failed items (bad URL parse, createMemory errors, …)
      }

      await delay(IMPORT_ITEM_DELAY_MS);
    }

    return { imported, locked: false };
  } finally {
    if (!isCancelled()) {
      await options.persistSyncTimestamp();
    }
    options.releaseLock();
  }
}
