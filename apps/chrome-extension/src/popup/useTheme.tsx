import { useEffect, useCallback } from "react";
import { useMediaQuery, useSessionStorage } from "usehooks-ts";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const CACHE_KEY = "vmem-resolved-theme";

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Hook to manage theme state synced with Convex userSettings.
 * Must be used inside ExtensionUserSettingsProvider.
 */
export function useTheme() {
  const { settings, update } = useExtensionUserSettings();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [, setCachedTheme] = useSessionStorage<ResolvedTheme>(
    CACHE_KEY,
    "dark",
  );

  const theme: Theme = settings?.theme ?? "system";
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  // Apply theme and cache when it changes
  useEffect(() => {
    applyTheme(resolvedTheme);
    setCachedTheme(resolvedTheme);
  }, [resolvedTheme, setCachedTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      void update({ theme: newTheme });
    },
    [update],
  );

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}

/**
 * Apply system-based theme for signed-out users.
 * Does not require ExtensionUserSettingsProvider.
 */
export function useSystemTheme() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [, setCachedTheme] = useSessionStorage<ResolvedTheme>(
    CACHE_KEY,
    "dark",
  );

  const resolvedTheme: ResolvedTheme = prefersDark ? "dark" : "light";

  // Apply theme and cache when it changes
  useEffect(() => {
    applyTheme(resolvedTheme);
    setCachedTheme(resolvedTheme);
  }, [resolvedTheme, setCachedTheme]);

  return { resolvedTheme };
}
