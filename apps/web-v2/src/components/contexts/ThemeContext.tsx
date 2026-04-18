"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const convexUser = useQuery(api.users.getMe);
  const updateTheme = useMutation(api.users.setTheme);
  const hasSynced = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || hasSynced.current || convexUser === undefined) return;
    hasSynced.current = true;
    if (convexUser?.theme) {
      setTheme(convexUser.theme);
    }
  }, [mounted, convexUser, setTheme]);

  const handleSetTheme = (newTheme: string) => {
    setTheme(newTheme);
    if (newTheme === "light" || newTheme === "dark") {
      void updateTheme({ theme: newTheme });
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    handleSetTheme(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: theme || "dark",
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
