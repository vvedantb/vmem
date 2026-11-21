// App theme provider + hook (class on <html>, `theme` localStorage key).
import { useEffect } from "react";
import { createThemeProvider, type ThemeProviderProps } from "@vvedantb/ui";
import { isDarkTheme, THEMES } from "@vmem/shared";

const kit = createThemeProvider();

export const { useTheme } = kit;

// Neutral writes the `dark` class; `NeutralClassSync` adds `neutral` beside it.
const THEME_CLASS: Record<string, string> = {
  light: "light",
  dark: "dark",
  neutral: "dark",
};

const STORED_THEMES = THEMES.filter((theme) => theme !== "system");

export function ThemeProvider({
  children,
  ...props
}: Omit<ThemeProviderProps, "themes" | "value" | "enableColorScheme">) {
  return (
    <kit.ThemeProvider
      {...props}
      themes={STORED_THEMES}
      value={THEME_CLASS}
      enableColorScheme={false}
    >
      <NeutralClassSync />
      {children}
    </kit.ThemeProvider>
  );
}

// The kit only removes the classes in `value`, so it never touches `neutral`,
// and with `enableColorScheme` off this effect is the one writer of colorScheme.
function NeutralClassSync() {
  const { forcedTheme, resolvedTheme } = useTheme();
  const activeTheme = forcedTheme ?? resolvedTheme;
  useEffect(() => {
    if (activeTheme === undefined) return;
    const root = document.documentElement;
    root.classList.toggle("neutral", activeTheme === "neutral");
    root.style.colorScheme = isDarkTheme(activeTheme) ? "dark" : "light";
  }, [activeTheme]);
  return null;
}
