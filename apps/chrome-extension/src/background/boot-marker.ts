const BOOT_AT_KEY = "vmemSwBootAt";
const BOOT_ERROR_KEY = "vmemSwBootError";
const BOOT_PHASE_KEY = "vmemSwBootPhase";
/** Bumped when SW bundle shape changes — visible in debug report to confirm reload. */
export const SW_BUILD_STAMP = "static-sw-20260524b";

void chrome.storage.local
  .set({ vmemSwBuildStamp: SW_BUILD_STAMP })
  .catch(() => {});

export function markBootPhase(phase: string): void {
  void chrome.storage.local
    .set({
      [BOOT_AT_KEY]: Date.now(),
      [BOOT_PHASE_KEY]: phase,
      [BOOT_ERROR_KEY]: "",
    })
    .catch(() => {});
}

export function markBootFailed(error: string): void {
  void chrome.storage.local
    .set({
      [BOOT_AT_KEY]: Date.now(),
      [BOOT_ERROR_KEY]: error,
      [BOOT_PHASE_KEY]: "failed",
    })
    .catch(() => {});
}

markBootPhase("entry");
