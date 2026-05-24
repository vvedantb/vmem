import { markBootFailed, markBootPhase } from "./boot-marker";
import { registerContextMenu } from "./context-menu";
import {
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
} from "./sync-scheduler";

export async function runBackgroundBootstrap(): Promise<void> {
  try {
    markBootPhase("bootstrap-loading");
    registerContextMenu();
    await bootstrapSyncSchedulers();
    void catchUpHistorySyncIfOverdue();
    markBootPhase("bootstrap-ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markBootFailed(message);
    console.error("[vmem] Background bootstrap failed:", message);
  }
}
