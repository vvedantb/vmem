import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { FormSettings } from "../src/settings-schema";
import { viewStateSchema, type ViewState } from "../src/view-state";

// Main owns the state. This store mirrors it into React and pushes no state of its own.
let snapshot: ViewState | null = null;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();

function receive(raw: unknown): void {
  snapshot = viewStateSchema.parse(raw);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribe = window.vmemDesktop.onState(receive);
    void window.vmemDesktop.getState().then(receive);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unsubscribe?.();
  };
}

export function useViewState(): ViewState | null {
  return useSyncExternalStore(subscribe, () => snapshot);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Saves a patch. Main validates it and pushes the new state back. */
export async function saveSettings(
  patch: Partial<FormSettings>,
): Promise<void> {
  try {
    await window.vmemDesktop.saveSettings(patch);
    toast.success("Saved");
  } catch (error) {
    toast.error(message(error));
  }
}
