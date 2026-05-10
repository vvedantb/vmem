import { api } from "@vmem/backend";
import { setStorage } from "@/lib/storage";
import { createAuthenticatedConvexClient } from "./auth";

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
  } catch {
    return;
  }
}
