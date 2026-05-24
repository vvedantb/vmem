/** Re-sync codebases that have not synced in the last 24 hours. */
export const DAILY_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

/** Treat `syncing` as stuck after this long (action timeout / network failure). */
export const STALE_SYNCING_MS = 20 * 60 * 1000;
