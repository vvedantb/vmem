export type Theme = "light" | "dark" | "system";

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
