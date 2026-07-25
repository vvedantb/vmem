import { useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

// hook to manage theme state synced with convex userSettings
// must be used inside ExtensionUserSettingsProvider
export function useTheme() {
  const { settings, update } = useExtensionUserSettings();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  // theme preference from convex (source of truth)
  const theme: Theme = settings?.theme ?? "system";

  // resolve "system" to actual light/dark based on os preference
  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  // apply theme class when resolved theme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  function setTheme(newTheme: Theme) {
    void update({ theme: newTheme });
  }

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}

// apply system based theme for signed out users
// does not require ExtensionUserSettingsProvider
export function useSystemTheme() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedTheme: ResolvedTheme = prefersDark ? "dark" : "light";

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return { resolvedTheme };
}
