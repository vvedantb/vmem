import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { getStorage, setStorage } from "@/lib/storage";
import {
  setExtensionDefaultProfile as setExtensionDefaultProfileHttp,
  updateUserSettings,
  type UserSettingsUpdateArgs,
} from "@/background/api-client";
import { convexSettingsToStorageMirror } from "@/types/storage";

function useExtensionUserSettingsInner() {
  const settings = useQuery(api.userSettings.get);
  const baseUpdate = useMutation(api.userSettings.update);
  const baseSetDefaultProfile = useMutation(api.userSettings.setDefaultProfile);

  // optimistic ws + durable http write (popup socket can drop on close)
  async function update(args: UserSettingsUpdateArgs): Promise<void> {
    void baseUpdate(args).catch(() => {
      // http write below is source of truth
    });

    try {
      await updateUserSettings(args);
    } catch (error) {
      console.warn("[vmem] Failed to persist user settings:", error);
    }
  }

  async function setExtensionDefaultProfile(
    profileId: Id<"profiles">,
  ): Promise<void> {
    void baseSetDefaultProfile({
      source: "extension",
      profileId,
    }).catch(() => {
      // http write below is source of truth
    });

    try {
      await setExtensionDefaultProfileHttp(profileId);
    } catch (error) {
      console.warn(
        "[vmem] Failed to persist extension default profile:",
        error,
      );
    }

    await setStorage({ defaultProfileId: profileId });
  }

  const migrationRan = useRef(false);

  useEffect(() => {
    if (settings === undefined || migrationRan.current) return;
    if (settings._id !== null) {
      migrationRan.current = true;
      return;
    }
    migrationRan.current = true;
    void getStorage().then((local) => {
      const mirrored = convexSettingsToStorageMirror(settings);
      if (
        local.autoSyncEnabled === mirrored.autoSyncEnabled &&
        local.autoSyncIntervalMinutes === mirrored.autoSyncIntervalMinutes &&
        local.selectionPopupEnabled === mirrored.selectionPopupEnabled
      ) {
        return;
      }
      const args = {
        extensionAutoSyncEnabled: local.autoSyncEnabled,
        extensionAutoSyncIntervalMinutes: local.autoSyncIntervalMinutes,
        extensionSelectionPopupEnabled: local.selectionPopupEnabled,
      };
      void baseUpdate(args).catch(() => {
        // http write below is source of truth
      });
      void updateUserSettings(args).catch((error: unknown) => {
        console.warn("[vmem] Failed to persist user settings:", error);
      });
    });
  }, [settings, baseUpdate]);

  useEffect(() => {
    if (settings === undefined) return;
    void setStorage(convexSettingsToStorageMirror(settings));
  }, [settings]);

  return { settings, update, setExtensionDefaultProfile };
}

type ExtensionUserSettingsContextValue = ReturnType<
  typeof useExtensionUserSettingsInner
>;

const ExtensionUserSettingsContext =
  createContext<ExtensionUserSettingsContextValue | null>(null);

export function ExtensionUserSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useExtensionUserSettingsInner();
  return (
    <ExtensionUserSettingsContext.Provider value={value}>
      {children}
    </ExtensionUserSettingsContext.Provider>
  );
}

export function useExtensionUserSettings(): ExtensionUserSettingsContextValue {
  const ctx = useContext(ExtensionUserSettingsContext);
  if (ctx === null) {
    throw new Error(
      "useExtensionUserSettings must be used within ExtensionUserSettingsProvider",
    );
  }
  return ctx;
}
