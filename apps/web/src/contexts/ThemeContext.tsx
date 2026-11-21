import { createContext, use, useEffect, useSyncExternalStore } from "react";
import { useTheme } from "@/providers/theme";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { isDarkTheme, isTheme, type Theme } from "@vmem/shared";
import { patchUserSettingsGet } from "@/lib/convex-optimistic";

interface ThemeContextType {
  theme: Theme;
  // matches the active document class (respects system preference)
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, setTheme: setNextTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate((localStore, args) => {
    patchUserSettingsGet(localStore, args);
  });

  // apply Convex theme to the document when settings load or change externally
  // do not depend on nextTheme that caused a revert flicker while mutations were in flight
  useEffect(() => {
    if (!mounted || settings === undefined) return;
    const convexTheme = settings.theme ?? "system";
    setNextTheme(convexTheme);
  }, [mounted, settings, setNextTheme]);

  const theme: Theme = isTheme(settings?.theme) ? settings.theme : "system";

  const handleSetTheme = (newTheme: Theme) => {
    setNextTheme(newTheme);
    void updateSettings({ theme: newTheme });
  };

  // matches the active document class (neutral counts as dark)
  const isDark = mounted && isDarkTheme(resolvedTheme);

  const toggleTheme = () => {
    handleSetTheme(isDarkTheme(resolvedTheme) ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        setTheme: handleSetTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = use(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
