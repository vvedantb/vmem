import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

const LIGHT = {
  background: "hsl(0, 0%, 96%)",
  foreground: "hsl(0, 0%, 15%)",
  primary: "hsl(0, 0%, 13%)",
  card: "hsl(0, 0%, 99%)",
  border: "hsl(0, 0%, 88%)",
  destructive: "hsl(8, 80%, 56%)",
  muted: "hsl(0, 0%, 45%)",
};

const DARK = {
  background: "hsl(260, 8%, 12%)",
  foreground: "hsl(260, 4%, 96%)",
  primary: "hsl(260, 5%, 92%)",
  card: "hsl(260, 6%, 17%)",
  border: "hsl(260, 4%, 28%)",
  destructive: "hsl(6, 70%, 60%)",
  muted: "hsl(260, 4%, 67%)",
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: LIGHT.background,
      border: LIGHT.border,
      card: LIGHT.card,
      notification: LIGHT.destructive,
      primary: LIGHT.primary,
      text: LIGHT.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: DARK.background,
      border: DARK.border,
      card: DARK.card,
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
