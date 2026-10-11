import { requestConfirm } from "./confirmSkip";
import { useAltHeld } from "./useAltHeld";

/**
 * Binds `useAltHeld` once so callers do not pass the store flag on every
 * confirmable control.
 */
export function useRequestConfirm() {
  const altHeld = useAltHeld();
  return {
    altHeld,
    request: (
      open: () => void,
      confirm: () => void,
      event?: { altKey?: boolean } | null,
    ) => {
      requestConfirm(altHeld, open, confirm, event);
    },
  };
}
