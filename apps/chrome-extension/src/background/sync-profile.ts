import { listProfiles } from "./api-client";
import { getStorage, setStorage } from "@/lib/storage";

/**
 * Resolve the vmem profile that THIS browser's auto-sync saves into.
 *
 * The selection lives in chrome.storage.local, which Chrome keeps per
 * browser profile — so a uni and a personal Chrome profile each hold
 * their own choice. Empty selection → undefined → the server resolves
 * the account default.
 *
 * Validated against the live profile list once per sync run: a stale id
 * (workspace deleted on the web) would make every createMemory throw and
 * the import loop would silently skip an entire window of history, so a
 * stale selection clears itself and falls back to the server default.
 */
export async function getSyncProfileId(): Promise<string | undefined> {
  const { defaultProfileId } = await getStorage();
  if (!defaultProfileId) return undefined;

  try {
    const profiles = await listProfiles();
    if (profiles.some((p) => p._id === defaultProfileId)) {
      return defaultProfileId;
    }
    await setStorage({ defaultProfileId: "" });
    return undefined;
  } catch {
    // Transient listProfiles failure — keep the stored id; per-entry
    // failures are skipped and the next run revalidates.
    return defaultProfileId;
  }
}
