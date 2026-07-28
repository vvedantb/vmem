// in-memory locks prevent overlapping bookmark and history syncs
// sw restart clears them because no sync survives restart

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
