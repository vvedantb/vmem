import { registerContextMenu } from "./context-menu";
import {
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
  refreshUserSettingsMirrorFromConvex,
} from "./sync-scheduler";

// shared sw bootstrap path: context menu + settings mirror + sync alarms
// used on cold start onInstalled and onStartup so those paths stay identical
export async function runBackgroundBootstrap(): Promise<void> {
  try {
    registerContextMenu();
    await refreshUserSettingsMirrorFromConvex();
    await bootstrapSyncSchedulers();
    void catchUpHistorySyncIfOverdue();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[vmem] Background bootstrap failed:", message);
  }
}
