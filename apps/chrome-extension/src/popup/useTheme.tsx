import { useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import type { Theme } from "@vmem/shared";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

type ResolvedTheme = "light" | "dark";

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

// requires ExtensionUserSettingsProvider
export function useTheme() {
  const { settings, update } = useExtensionUserSettings();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const theme: Theme = settings?.theme ?? "system";

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme;

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

// signed out users follow os theme without convex settings
export function useSystemTheme() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedTheme: ResolvedTheme = prefersDark ? "dark" : "light";

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  return { resolvedTheme };
}
