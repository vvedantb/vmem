import { requestConfirm } from "./confirmSkip";
import { getAltHeld } from "./useAltHeld";

/**
 * Confirm helper for menu owners. It must not subscribe to Alt: a re-render of
 * the owner when Alt goes down remounts the open Radix menu and closes it.
 * `ConfirmSkipHint` is the only subscriber and lives inside the open menu.
 * The Alt state is read when the request happens.
 */
export function useRequestConfirm() {
  return {
    request: (
      open: () => void,
      confirm: () => void,
      event?: { altKey?: boolean } | null,
    ) => {
      requestConfirm(getAltHeld(), open, confirm, event);
    },
  };
}
