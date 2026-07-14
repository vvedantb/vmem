import { markBootFailed, markBootPhase } from "./boot-marker";
import { registerContextMenu } from "./context-menu";
import {
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
  refreshUserSettingsMirrorFromConvex,
} from "./sync-scheduler";

/**
 * Shared SW bootstrap path: context menu + settings mirror + sync alarms.
 * Used on cold start, onInstalled, and onStartup so those paths stay identical.
 */
export async function runBackgroundBootstrap(): Promise<void> {
  try {
    markBootPhase("bootstrap-loading");
    registerContextMenu();
    await refreshUserSettingsMirrorFromConvex();
    await bootstrapSyncSchedulers();
    void catchUpHistorySyncIfOverdue();
    markBootPhase("bootstrap-ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markBootFailed(message);
    console.error("[vmem] Background bootstrap failed:", message);
  }
}
