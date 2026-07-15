import { listProfiles } from "./api-client";
import { getStorage, setStorage } from "@/lib/storage";

// per browser profile for sync clears stale ids
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
    // keep stored id on transient list failure
    return defaultProfileId;
  }
}
