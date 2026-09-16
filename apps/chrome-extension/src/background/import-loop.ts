import { delay } from "es-toolkit";
import { createMemory } from "./api-client";
import type { CreateMemoryParams } from "@/types/api";
import { sendMessage } from "@/lib/messaging";
import { isCancelled, resetCancel } from "./import-cancel";

const IMPORT_ITEM_DELAY_MS = 100;

export interface ImportResult {
  imported: number;
  locked: boolean;
}

// shared import loop keeps bookmark and history progress behavior identical
// AI-generated (Claude), prompt: "locked cancelable import loop with per item delay"
// Modified by me: progress messages and timestamp only when not cancelled
export async function runLockedImportLoop<T>(options: {
  acquireLock: () => boolean;
  releaseLock: () => void;
  silent: boolean;
  loadItems: () => Promise<T[]>;
  toCreateParams: (item: T) => CreateMemoryParams | null;
  persistSyncTimestamp: () => Promise<void>;
  createItem?: (params: CreateMemoryParams) => Promise<unknown>;
  itemDelayMs?: number;
}): Promise<ImportResult> {
  if (!options.acquireLock()) {
    return { imported: 0, locked: true };
  }

  try {
    resetCancel();
    const items = await options.loadItems();
    const createItem = options.createItem ?? createMemory;
    const itemDelayMs = options.itemDelayMs ?? IMPORT_ITEM_DELAY_MS;
    let imported = 0;
    let processed = 0;

    for (const item of items) {
      if (isCancelled()) break;

      try {
        const params = options.toCreateParams(item);
        if (!params) continue;

        await createItem(params);
        processed++;
        imported++;

        if (!options.silent) {
          void sendMessage("importProgress", {
            current: processed,
            total: items.length,
          }).catch(() => {});
        }
      } catch {
        // skip bad urls and createMemory failures
      }

      await delay(itemDelayMs);
    }

    return { imported, locked: false };
  } finally {
    if (!isCancelled()) {
      await options.persistSyncTimestamp();
    }
    options.releaseLock();
  }
}
