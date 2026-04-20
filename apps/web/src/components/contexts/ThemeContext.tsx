"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Use userSettings (same as extension) - single source of truth
  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(api.userSettings.update);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync next-themes with Convex userSettings (reactive)
  useEffect(() => {
    if (!mounted || settings === undefined) return;
    const convexTheme = settings.theme ?? "system";
    if (nextTheme !== convexTheme) {
      setNextTheme(convexTheme);
    }
  }, [mounted, settings, nextTheme, setNextTheme]);

  const theme: Theme = (settings?.theme as Theme) ?? "system";

  const handleSetTheme = (newTheme: Theme) => {
    setNextTheme(newTheme);
    void updateSettings({ theme: newTheme });
  };

  const toggleTheme = () => {
    // Toggle between light and dark (skip system in toggle)
    const resolved = nextTheme === "dark" ? "light" : "dark";
    handleSetTheme(resolved);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
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
