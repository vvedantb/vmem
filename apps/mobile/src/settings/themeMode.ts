import { isTheme, type Theme } from "@vmem/shared";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { useSyncExternalStore } from "react";
import { applyDarkFamily } from "@/ui/theme";

/**
 * The appearance mode on this phone: light, neutral, dark or system. It is
 * kept in SecureStore, not on the account. Neutral is the NativeWind dark
 * scheme with the Neutral palette in the kit's dark slot.
 */
const KEY = "vmem.themeMode";
let current: Theme = "system";
/** True once the user picked a mode: a slow SecureStore read must not undo it. */
let chosen = false;
const listeners = new Set<() => void>();

/** Paints `mode`. The dark slot is set first, so the redraw reads it. */
function apply(mode: Theme) {
  current = mode;
  applyDarkFamily(mode === "neutral" ? "neutral" : "dark");
  colorScheme.set(mode === "neutral" ? "dark" : mode);
  for (const listener of listeners) listener();
}

/** Applies this phone's last mode once at start. Defaults to the system setting. */
export async function restoreThemeMode() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (chosen) return;
  apply(saved !== null && isTheme(saved) ? saved : "system");
}

/** Paints `mode` at once and keeps it for the next start. */
export function setThemeMode(mode: Theme) {
  chosen = true;
  if (mode !== current) apply(mode);
  SecureStore.setItemAsync(KEY, mode).catch(() => undefined);
}

/** The current mode, "system" included (NativeWind only reports the resolved scheme). */
export function useThemeMode(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
