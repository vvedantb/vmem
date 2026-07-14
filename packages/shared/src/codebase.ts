// bump when parser output shape changes — triggers codebase re-sync
export const PARSER_VERSION = "1.0.0";

// timed-out / dead sync hosts never write a terminal status; past this window
// both the UI and backend recovery sweep treat `syncing` as stuck
export const STALE_SYNCING_MS = 20 * 60 * 1000;

type CodebaseStatus = "pending" | "syncing" | "synced" | "error";

// shared stall check so UI badge and recovery sweep agree; missing
// syncStartedAt on a syncing row counts as stalled (can't prove it's live)
export function isCodebaseSyncStalled(
  status: CodebaseStatus,
  syncStartedAt: number | undefined,
  now: number = Date.now(),
): boolean {
  if (status !== "syncing") return false;
  if (syncStartedAt === undefined) return true;
  return now - syncStartedAt >= STALE_SYNCING_MS;
}
