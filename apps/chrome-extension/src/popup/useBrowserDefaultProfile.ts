import { useEffect, useState } from "react";
import { getStorage } from "@/lib/storage";

type ProfileLike = {
  _id: string;
  isDefault: boolean;
};

/**
 * Per-browser active profile from chrome.storage.local, falling back to the
 * account default once profiles load. Storage stays browser-scoped on purpose
 * (uni vs personal Chrome profiles).
 */
export function useBrowserDefaultProfile(profiles: ProfileLike[] | undefined): {
  effectiveProfileId: string;
  setSelectedProfileId: (profileId: string) => void;
} {
  const [selectedProfileId, setSelectedProfileId] = useState("");

  useEffect(() => {
    void getStorage().then((storage) => {
      if (storage.defaultProfileId) {
        setSelectedProfileId(storage.defaultProfileId);
      }
    });
  }, []);

  return {
    effectiveProfileId:
      selectedProfileId || profiles?.find((p) => p.isDefault)?._id || "",
    setSelectedProfileId,
  };
}
