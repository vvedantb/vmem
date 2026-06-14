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

function useExtensionUserSettingsInner() {
  const settings = useQuery(api.userSettings.get);
  const baseUpdate = useMutation(api.userSettings.update);

  // Settings writes go through TWO paths on purpose:
  //   1. The websocket mutation with an optimistic update — instant slider/
  //      toggle feedback, and an instant chrome.storage mirror via the
  //      [settings] effect below so the service worker reschedules at once.
  //   2. The background HTTP client (updateUserSettings) — the DURABLE write.
  //      The popup websocket can stall or never flush before the popup closes,
  //      which left Convex stale; the SW settings mirror then re-pulled the old
  //      value and reverted behaviour (notably resetting the history-sync alarm
  //      to 30m). Persisting over the reliable HTTP path keeps Convex current.
  const update = useCallback(
    async (args: UserSettingsUpdateArgs): Promise<void> => {
      void baseUpdate
        .withOptimisticUpdate((localStore) => {
          const current = localStore.getQuery(api.userSettings.get, {});
          if (!current) return;
          localStore.setQuery(
            api.userSettings.get,
            {},
            { ...current, ...args },
          );
        })(args)
        .catch(() => {
          // Best-effort — the durable HTTP write below is the source of truth.
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
