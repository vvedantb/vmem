import {
  DarkTheme,
  DefaultTheme,
  type Theme,
} from "expo-router/react-navigation";

/** Mirrors src/global.css (which mirrors apps/web/src/globals.css). */
const LIGHT = {
  background: "hsl(0, 0%, 96%)",
  foreground: "hsl(0, 0%, 10%)",
  primary: "hsl(0, 0%, 10%)",
  primaryForeground: "hsl(0, 0%, 99%)",
  card: "hsl(0, 0%, 97%)",
  border: "hsl(0, 0%, 87%)",
  destructive: "hsl(8, 80%, 56%)",
  muted: "hsl(0, 0%, 45%)",
  accent: "hsl(0, 0%, 10%)",
  accentForeground: "hsl(0, 0%, 99%)",
  surface: "hsl(0, 0%, 100%)",
  surfaceSecondary: "hsl(0, 0%, 94%)",
  surfaceTertiary: "hsl(0, 0%, 92%)",
  overlay: "hsl(0, 0%, 100%)",
  defaultFill: "hsl(0, 0%, 92%)",
  segment: "hsl(0, 0%, 100%)",
  separator: "hsl(0, 0%, 90%)",
  success: "hsl(145, 50%, 42%)",
  warning: "hsl(38, 80%, 55%)",
};

const DARK: typeof LIGHT = {
  background: "hsl(0, 0%, 2%)",
  foreground: "hsl(0, 0%, 99%)",
  primary: "hsl(0, 0%, 99%)",
  primaryForeground: "hsl(0, 0%, 10%)",
  card: "hsl(0, 0%, 14%)",
  border: "hsl(0, 0%, 16%)",
  destructive: "hsl(6, 70%, 60%)",
  muted: "hsl(0, 0%, 63%)",
  accent: "hsl(0, 0%, 99%)",
  accentForeground: "hsl(0, 0%, 10%)",
  surface: "hsl(0, 0%, 10%)",
  surfaceSecondary: "hsl(0, 0%, 14%)",
  surfaceTertiary: "hsl(0, 0%, 15%)",
  overlay: "hsl(0, 0%, 10%)",
  defaultFill: "hsl(0, 0%, 15%)",
  segment: "hsl(0, 0%, 28%)",
  separator: "hsl(0, 0%, 13%)",
  success: "hsl(147, 60%, 60%)",
  warning: "hsl(40, 80%, 65%)",
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: LIGHT.surface,
      border: LIGHT.border,
      card: LIGHT.surface,
      notification: LIGHT.destructive,
      primary: LIGHT.primary,
      text: LIGHT.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: DARK.surface,
      border: DARK.border,
      card: DARK.surface,
      notification: DARK.destructive,
      primary: DARK.primary,
      text: DARK.foreground,
    },
  },
};

export const THEME_COLORS = {
  light: LIGHT,
  dark: DARK,
} as const;
