import { useEffect, useState, useCallback } from "react";
import { useExtensionUserSettings } from "./useExtensionUserSettings";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const CACHE_KEY = "vmem-resolved-theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  try {
    sessionStorage.setItem(CACHE_KEY, resolved);
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Hook to manage theme state synced with Convex userSettings.
 * Must be used inside ExtensionUserSettingsProvider.
 */
export function useTheme() {
  const { settings, update } = useExtensionUserSettings();
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    // Initialize from cache or system preference
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached === "light" || cached === "dark") return cached;
    } catch {
      // sessionStorage may be unavailable
    }
    return getSystemTheme();
  });

  const theme: Theme = settings?.theme ?? "system";

  // Resolve theme and listen for system changes
  useEffect(() => {
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        const newResolved = e.matches ? "dark" : "light";
        setResolvedTheme(newResolved);
        applyTheme(newResolved);
      };

      const initial = mediaQuery.matches ? "dark" : "light";
      setResolvedTheme(initial);
      applyTheme(initial);

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      setResolvedTheme(theme);
      applyTheme(theme);
    }
  }, [theme]);

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
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached === "light" || cached === "dark") return cached;
    } catch {
      // sessionStorage may be unavailable
    }
    return getSystemTheme();
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? "dark" : "light";
      setResolvedTheme(newResolved);
      applyTheme(newResolved);
    };

    const initial = mediaQuery.matches ? "dark" : "light";
    setResolvedTheme(initial);
    applyTheme(initial);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return { resolvedTheme };
}
