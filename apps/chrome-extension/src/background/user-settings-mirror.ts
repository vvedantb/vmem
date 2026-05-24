import { api } from "@vmem/backend";
import { setStorage } from "@/lib/storage";
import { createAuthenticatedConvexClient } from "./auth";
import { startAutoSync, stopAutoSync } from "./sync-scheduler";

async function reconcileAutoSyncAlarm(enabled: boolean): Promise<void> {
  if (enabled) {
    await startAutoSync();
  } else {
    await stopAutoSync();
  }
}

export async function refreshUserSettingsMirrorFromConvex(): Promise<void> {
  const client = await createAuthenticatedConvexClient();
  if (!client) {
    return;
  }

  try {
    const settings = await client.query(api.userSettings.get, {});
    await setStorage({
      autoSyncEnabled: settings.extensionAutoSyncEnabled,
      selectionPopupEnabled: settings.extensionSelectionPopupEnabled,
    });
    if (settings.extensionAutoSyncEnabled) {
      await reconcileAutoSyncAlarm(true);
    } else {
      await reconcileAutoSyncAlarm(false);
    }
  } catch {
    return;
  }
}
