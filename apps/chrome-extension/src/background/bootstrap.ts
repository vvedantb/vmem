import { errorMessage } from "@/lib/error";
import { registerContextMenu } from "./context-menu";
import { ensureUnpartitionedClerkClientCookie } from "./sync-host-cookie-listener";
import {
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
  refreshUserSettingsMirrorFromConvex,
} from "./sync-scheduler";

// same bootstrap path for cold start, install, and startup listeners
export async function runBackgroundBootstrap(): Promise<void> {
  try {
    registerContextMenu();
    await ensureUnpartitionedClerkClientCookie();
    await refreshUserSettingsMirrorFromConvex();
    await bootstrapSyncSchedulers();
    void catchUpHistorySyncIfOverdue();
  } catch (error) {
    const message = errorMessage(error);
    console.error("[vmem] Background bootstrap failed:", message);
  }
}
