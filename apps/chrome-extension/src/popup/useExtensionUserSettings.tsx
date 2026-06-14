import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { getStorage, setStorage } from "@/lib/storage";

function useExtensionUserSettingsInner() {
  const settings = useQuery(api.userSettings.get);
  const update = useMutation(api.userSettings.update).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.userSettings.get, {});
      if (!current) return;
      localStore.setQuery(api.userSettings.get, {}, { ...current, ...args });
    },
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
      if (
        local.autoSyncEnabled === settings.extensionAutoSyncEnabled &&
        local.autoSyncIntervalMinutes ===
          settings.extensionAutoSyncIntervalMinutes &&
        local.selectionPopupEnabled === settings.extensionSelectionPopupEnabled
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
    void setStorage({
      autoSyncEnabled: settings.extensionAutoSyncEnabled,
      autoSyncIntervalMinutes: settings.extensionAutoSyncIntervalMinutes,
      selectionPopupEnabled: settings.extensionSelectionPopupEnabled,
    });
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
