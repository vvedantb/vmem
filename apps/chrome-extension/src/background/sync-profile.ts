import { getExtensionDefaultProfileId, listProfiles } from "./api-client";
import { getStorage, setStorage } from "@/lib/storage";
import { resolveExtensionProfileId } from "@/lib/resolve-extension-profile";

// chrome.storage profile with convex fallback when local id goes stale
export async function getSyncProfileId(): Promise<string | undefined> {
  const { defaultProfileId: storageId } = await getStorage();

  let profiles;
  try {
    profiles = await listProfiles();
  } catch {
    return storageId || undefined;
  }

  if (storageId && profiles.some((profile) => profile._id === storageId)) {
    return storageId;
  }

  if (storageId) {
    await setStorage({ defaultProfileId: "" });
  }

  let convexDefault: string | null;
  try {
    convexDefault = await getExtensionDefaultProfileId();
  } catch {
    return undefined;
  }

  const resolved = resolveExtensionProfileId({
    storageProfileId: "",
    convexExtensionDefaultId: convexDefault,
    profiles,
  });

  if (resolved) {
    await setStorage({ defaultProfileId: resolved });
    return resolved;
  }

  return undefined;
}
