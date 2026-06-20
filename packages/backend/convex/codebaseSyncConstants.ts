/** Re-sync codebases that have not synced in the last 24 hours. */
export const DAILY_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Treat `syncing` as stuck after this long (action timeout / network failure).
 * Re-exported from `@vmem/shared` so backend and web share one threshold; the
 * existing backend import sites keep using this module's path.
 */
export { STALE_SYNCING_MS } from "@vmem/shared";
