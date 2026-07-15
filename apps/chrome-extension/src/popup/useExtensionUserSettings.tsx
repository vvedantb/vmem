import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { getStorage, setStorage } from "@/lib/storage";
import {
  updateUserSettings,
  type UserSettingsUpdateArgs,
} from "@/background/api-client";
import { convexSettingsToStorageMirror } from "@/types/storage";

function useExtensionUserSettingsInner() {
  const settings = useQuery(api.userSettings.get);
  const baseUpdate = useMutation(api.userSettings.update);

  // optimistic ws + durable http write (popup socket can drop on close)
  const update = useCallback(
    async (args: UserSettingsUpdateArgs): Promise<void> => {
      void baseUpdate(args).catch(() => {
        // http write below is source of truth
      });

      try {
        await updateUserSettings(args);
      } catch (error) {
        console.warn("[vmem] Failed to persist user settings:", error);
      }
    },
    [baseUpdate],
  );

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
      void update({
        extensionAutoSyncEnabled: local.autoSyncEnabled,
        extensionAutoSyncIntervalMinutes: local.autoSyncIntervalMinutes,
        extensionSelectionPopupEnabled: local.selectionPopupEnabled,
      });
    });
  }, [settings, update]);

  useEffect(() => {
    if (settings === undefined) return;
    void setStorage(convexSettingsToStorageMirror(settings));
  }, [settings]);

  return { settings, update };
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
