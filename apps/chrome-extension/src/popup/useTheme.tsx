import { useEffect, useCallback } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

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

  // Theme preference from Convex (source of truth)
  const theme: Theme = settings?.theme ?? "system";

  // Resolve "system" to actual light/dark based on OS preference
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  // Apply theme class when resolved theme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

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
  const resolvedTheme: ResolvedTheme = prefersDark ? "dark" : "light";

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return { resolvedTheme };
}
