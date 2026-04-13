/**
 * In-memory locks to prevent overlapping bookmark/history syncs.
 * Service worker restart resets both to false — correct since no sync survives a restart.
 */

let bookmarkLockHeld = false;
let historyLockHeld = false;

export function acquireBookmarkLock(): boolean {
  if (bookmarkLockHeld) return false;
  bookmarkLockHeld = true;
  return true;
}

export function releaseBookmarkLock(): void {
  bookmarkLockHeld = false;
}

export function acquireHistoryLock(): boolean {
  if (historyLockHeld) return false;
  historyLockHeld = true;
  return true;
}

export function releaseHistoryLock(): void {
  historyLockHeld = false;
}
