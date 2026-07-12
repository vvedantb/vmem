"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  /** Matches the active document class (respects system preference). */
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    localStore.setQuery(api.userSettings.get, {}, { ...current, ...args });
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apply Convex theme to the document when settings load or change externally.
  // Do not depend on nextTheme — that caused a revert flicker while mutations were in flight.
  useEffect(() => {
    if (!mounted || settings === undefined) return;
    const convexTheme = settings.theme ?? "system";
    setNextTheme(convexTheme);
  }, [mounted, settings?.theme, setNextTheme]);

  const theme: Theme = isTheme(settings?.theme) ? settings.theme : "system";

  const handleSetTheme = (newTheme: Theme) => {
    setNextTheme(newTheme);
    void updateSettings({ theme: newTheme });
  };

  const toggleTheme = () => {
    const resolved = resolvedTheme === "dark" ? "light" : "dark";
    handleSetTheme(resolved);
  };

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        setTheme: handleSetTheme,
        toggleTheme,
        mounted,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
