export const THEMES = ["light", "dark", "neutral", "system"] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: string | undefined): value is Theme {
  return THEMES.some((theme) => theme === value);
}

/** Neutral is a dark theme with the grey `.dark.neutral` tokens. */
export function isDarkTheme(resolvedTheme: string | undefined): boolean {
  return resolvedTheme === "dark" || resolvedTheme === "neutral";
}
