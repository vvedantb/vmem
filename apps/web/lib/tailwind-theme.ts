function c(name: string) {
  return `oklch(var(--${name}) / <alpha-value>)`;
}

export const themeExtend = {
  colors: {
    border: c("border"),
    input: c("input"),
    ring: c("ring"),
    background: c("background"),
    foreground: c("foreground"),
    primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
    secondary: {
      DEFAULT: c("secondary"),
      foreground: c("secondary-foreground"),
    },
    destructive: {
      DEFAULT: c("destructive"),
      foreground: c("destructive-foreground"),
    },
    success: { DEFAULT: c("success"), foreground: c("success-foreground") },
    warning: { DEFAULT: c("warning"), foreground: c("warning-foreground") },
    muted: { DEFAULT: c("muted"), foreground: c("muted-foreground") },
    accent: { DEFAULT: c("accent"), foreground: c("accent-foreground") },
    popover: { DEFAULT: c("popover"), foreground: c("popover-foreground") },
    card: { DEFAULT: c("card"), foreground: c("card-foreground") },
  },
  borderRadius: {
    xl: "calc(var(--radius) + 4px)",
    lg: "var(--radius)",
    md: "calc(var(--radius) - 2px)",
    sm: "calc(var(--radius) - 4px)",
  },
};
