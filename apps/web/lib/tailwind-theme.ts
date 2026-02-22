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
    sidebar: { DEFAULT: c("sidebar"), foreground: c("sidebar-foreground") },
    info: { DEFAULT: c("info"), foreground: c("info-foreground") },
  },
  borderRadius: {
    xl: "calc(var(--radius) + 4px)",
    lg: "var(--radius)",
    md: "calc(var(--radius) - 2px)",
    sm: "calc(var(--radius) - 4px)",
  },
  boxShadow: {
    soft: "0 1px 2px rgba(16, 24, 40, 0.06), 0 10px 28px rgba(16, 24, 40, 0.06)",
    panel:
      "0 1px 2px rgba(16, 24, 40, 0.05), 0 16px 44px rgba(16, 24, 40, 0.1)",
    insetSoft:
      "inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(16, 24, 40, 0.04)",
  },
  transitionTimingFunction: {
    smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
};
