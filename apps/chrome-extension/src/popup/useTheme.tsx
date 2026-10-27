import { useEffect } from "react";
import { applyThemeClass, useMediaQuery } from "@vvedantb/ui/client";
import type { Theme } from "@vmem/shared";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

// theme is a convex user setting, so the ui localStorage ThemeProvider does not fit
function useThemeClass(theme: Theme) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedTheme =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);
}

// requires ExtensionUserSettingsProvider
export function useTheme() {
  const { settings } = useExtensionUserSettings();
  useThemeClass(settings?.theme ?? "system");
}

// signed out users follow os theme without convex settings
export function useSystemTheme() {
  useThemeClass("system");
}
