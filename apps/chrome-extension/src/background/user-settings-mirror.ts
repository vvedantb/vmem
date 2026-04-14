import { ConvexHttpClient } from "convex/browser";
import { api } from "@vmem/backend";
import { CONVEX_URL } from "@/lib/constants";
import { getStorage, setStorage } from "@/lib/storage";

export async function refreshUserSettingsMirrorFromConvex(): Promise<void> {
  const { authToken } = await getStorage();
  if (!authToken) {
    return;
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(authToken);

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
