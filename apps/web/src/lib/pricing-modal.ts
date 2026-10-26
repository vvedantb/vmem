import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { FREE_MEMORY_LIMIT, isMemoryLimitMessage } from "@vmem/shared";
import { convexErrorMessage } from "./convex-error";

// One shared open flag so any surface can open the single mounted V Pro modal.
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  open = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openPricingModal() {
  set(true);
}

export function closePricingModal() {
  set(false);
}

export function usePricingModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

// Toast a failed memory create. On the Free cap, also open the upgrade modal.
// Returns true when the error was the cap.
export function toastMemoryError(err: unknown, fallback: string): boolean {
  const message = convexErrorMessage(err, fallback);
  const capped = isMemoryLimitMessage(message);
  toast.error(
    capped
      ? `You have reached the Free limit of ${String(FREE_MEMORY_LIMIT)} memories. Upgrade to V Pro for unlimited memories.`
      : message,
  );
  if (capped) openPricingModal();
  return capped;
}
