// App theme provider + hook (class on <html>, `theme` localStorage key).
import { createThemeProvider, type ThemeProviderProps } from "@vvedantb/ui";
import { THEMES } from "@vmem/shared";

const kit = createThemeProvider();

export const { useTheme } = kit;

// Neutral is `.dark.neutral`: both classes, colorScheme dark.
const THEME_CLASS: Record<string, string> = {
  light: "light",
  dark: "dark",
  neutral: "dark neutral",
};

const STORED_THEMES = THEMES.filter((theme) => theme !== "system");

export function ThemeProvider(
  props: Omit<ThemeProviderProps, "themes" | "value">,
) {
  return (
    <kit.ThemeProvider {...props} themes={STORED_THEMES} value={THEME_CLASS} />
  );
}
