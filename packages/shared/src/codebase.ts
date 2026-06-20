/** Bump when parser output shape changes — triggers codebase re-sync. */
export const PARSER_VERSION = "1.0.0";

/**
 * Treat a `syncing` codebase as stuck after this long. A sync action that
 * times out or whose host dies never writes a terminal status, so the row
 * would otherwise sit in `syncing` forever. Anything past this window is
 * considered dead by both the backend recovery sweep and the UI.
 */
export const STALE_SYNCING_MS = 20 * 60 * 1000;

type CodebaseStatus = "pending" | "syncing" | "synced" | "error";

/**
 * True when a codebase is wedged in `syncing` past the stale window — i.e. the
 * sync that set it never completed. Shared so the UI ("Sync stalled" badge,
 * re-enabling the Sync button) and the backend recovery sweep agree on exactly
 * what counts as stalled. A missing `syncStartedAt` on a `syncing` row is
 * treated as stalled (we can't prove it is live).
 */
export function isCodebaseSyncStalled(
  status: CodebaseStatus,
  syncStartedAt: number | undefined,
  now: number = Date.now(),
): boolean {
  if (status !== "syncing") return false;
  if (syncStartedAt === undefined) return true;
  return now - syncStartedAt >= STALE_SYNCING_MS;
}
