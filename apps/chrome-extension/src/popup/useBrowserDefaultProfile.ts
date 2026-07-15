import { useEffect, useState } from "react";
import { getStorage, setStorage } from "@/lib/storage";
import { resolveExtensionProfileId } from "@/lib/resolve-extension-profile";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";

type ProfileLike = {
  _id: string;
  isDefault: boolean;
};

export function useBrowserDefaultProfile(profiles: ProfileLike[] | undefined): {
  effectiveProfileId: string;
} {
  const { settings } = useExtensionUserSettings();
  const [storageProfileId, setStorageProfileId] = useState("");

  useEffect(() => {
    void getStorage().then((storage) => {
      setStorageProfileId(storage.defaultProfileId);
    });
  }, []);

  useEffect(() => {
    if (!profiles || !storageProfileId) return;
    if (profiles.some((profile) => profile._id === storageProfileId)) return;
    void setStorage({ defaultProfileId: "" });
    setStorageProfileId("");
  }, [profiles, storageProfileId]);

  const effectiveProfileId = resolveExtensionProfileId({
    storageProfileId,
    convexExtensionDefaultId: settings?.defaultProfiles?.extension ?? null,
    profiles,
  });

  return { effectiveProfileId };
}
