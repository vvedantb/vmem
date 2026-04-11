export type ViewMode =
  | "default"
  | "satellite"
  | "constellation"
  | "blueprint"
  | "minimal";

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  default: "Default",
  satellite: "Satellite",
  constellation: "Constellation",
  blueprint: "Blueprint",
  minimal: "Minimal",
};

export interface GraphViewTheme {
  isDarkCanvas: boolean;
  background: string;
  gradientCenter: string | null;
  grid: { color: string; spacing: number } | null;
  edge: {
    normal: string;
    connected: string;
    dimmed: string;
    width: number;
    connectedWidth: number;
  };
  glow: {
    enabled: boolean;
    radiusMultiplier: number;
    intensity: number;
    hoveredIntensity: number;
  };
  outline: {
    enabled: boolean;
    color: string;
    hoveredColor: "node" | string;
    width: number;
    hoveredWidth: number;
  };
  label: { color: string; secondary: string };
  dimAlpha: number;
  nodeColorOverride: string | null;
}

const DEFAULT_DARK: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#111111",
  gradientCenter: null,
  grid: null,
  edge: {
    normal: "rgba(255,255,255,0.06)",
    connected: "rgba(255,255,255,0.35)",
    dimmed: "rgba(255,255,255,0.015)",
    width: 0.4,
    connectedWidth: 1.2,
  },
  glow: {
    enabled: true,
    radiusMultiplier: 2.5,
    intensity: 0.15,
    hoveredIntensity: 0.35,
  },
  outline: {
    enabled: false,
    color: "rgba(0,0,0,0.12)",
    hoveredColor: "node",
    width: 0.5,
    hoveredWidth: 1.5,
  },
  label: { color: "rgba(255,255,255,0.9)", secondary: "rgba(255,255,255,0.4)" },
  dimAlpha: 0.05,
  nodeColorOverride: null,
};

const DEFAULT_LIGHT: GraphViewTheme = {
  isDarkCanvas: false,
  background: "#ffffff",
  gradientCenter: "rgba(80, 80, 180, 0.03)",
  grid: null,
  edge: {
    normal: "rgba(0,0,0,0.15)",
    connected: "rgba(0,0,0,0.25)",
    dimmed: "rgba(0,0,0,0.03)",
    width: 0.5,
    connectedWidth: 1.2,
  },
  glow: {
    enabled: false,
    radiusMultiplier: 4,
    intensity: 0,
    hoveredIntensity: 0,
  },
  outline: {
    enabled: true,
    color: "rgba(0,0,0,0.12)",
    hoveredColor: "node",
    width: 0.5,
    hoveredWidth: 1.5,
  },
  label: { color: "#111111", secondary: "rgba(0,0,0,0.4)" },
  dimAlpha: 0.08,
  nodeColorOverride: null,
};

const SATELLITE: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#030308",
  gradientCenter: "rgba(60, 40, 120, 0.08)",
  grid: null,
  edge: {
    normal: "rgba(255,255,255,0.02)",
    connected: "rgba(180,160,255,0.25)",
    dimmed: "rgba(255,255,255,0.01)",
    width: 0.2,
    connectedWidth: 0.6,
  },
  glow: {
    enabled: true,
    radiusMultiplier: 6,
    intensity: 0.4,
    hoveredIntensity: 0.6,
  },
  outline: {
    enabled: false,
    color: "transparent",
    hoveredColor: "node",
    width: 0,
    hoveredWidth: 0,
  },
  label: {
    color: "rgba(255,255,255,0.85)",
    secondary: "rgba(200,180,255,0.5)",
  },
  dimAlpha: 0.03,
  nodeColorOverride: null,
};

const CONSTELLATION: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#080e1a",
  gradientCenter: null,
  grid: null,
  edge: {
    normal: "rgba(140,180,255,0.5)",
    connected: "rgba(200,220,255,0.75)",
    dimmed: "rgba(140,180,255,0.08)",
    width: 0.8,
    connectedWidth: 1.4,
  },
  glow: {
    enabled: false,
    radiusMultiplier: 0,
    intensity: 0,
    hoveredIntensity: 0,
  },
  outline: {
    enabled: true,
    color: "rgba(140,180,255,0.3)",
    hoveredColor: "#ffffff",
    width: 0.8,
    hoveredWidth: 2,
  },
  label: { color: "#e0eaff", secondary: "rgba(180,200,255,0.6)" },
  dimAlpha: 0.06,
  nodeColorOverride: null,
};

const BLUEPRINT: GraphViewTheme = {
  isDarkCanvas: false,
  background: "#f0f4f8",
  gradientCenter: null,
  grid: { color: "#d0dae6", spacing: 40 },
  edge: {
    normal: "#8ba4bc",
    connected: "#5b7b9a",
    dimmed: "rgba(139,164,188,0.2)",
    width: 0.8,
    connectedWidth: 1.4,
  },
  glow: {
    enabled: false,
    radiusMultiplier: 0,
    intensity: 0,
    hoveredIntensity: 0,
  },
  outline: {
    enabled: true,
    color: "#5b7b9a",
    hoveredColor: "#3d5a80",
    width: 1,
    hoveredWidth: 2,
  },
  label: { color: "#2c4a6e", secondary: "rgba(44,74,110,0.5)" },
  dimAlpha: 0.1,
  nodeColorOverride: "#5b7b9a",
};

const MINIMAL_DARK: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#0a0a0a",
  gradientCenter: null,
  grid: null,
  edge: {
    normal: "rgba(255,255,255,0.03)",
    connected: "rgba(255,255,255,0.12)",
    dimmed: "rgba(255,255,255,0.01)",
    width: 0.3,
    connectedWidth: 0.5,
  },
  glow: {
    enabled: false,
    radiusMultiplier: 0,
    intensity: 0,
    hoveredIntensity: 0,
  },
  outline: {
    enabled: false,
    color: "transparent",
    hoveredColor: "node",
    width: 0,
    hoveredWidth: 0,
  },
  label: {
    color: "rgba(255,255,255,0.5)",
    secondary: "rgba(255,255,255,0.2)",
  },
  dimAlpha: 0.04,
  nodeColorOverride: "#666666",
};

const MINIMAL_LIGHT: GraphViewTheme = {
  isDarkCanvas: false,
  background: "#fafafa",
  gradientCenter: null,
  grid: null,
  edge: {
    normal: "rgba(0,0,0,0.06)",
    connected: "rgba(0,0,0,0.15)",
    dimmed: "rgba(0,0,0,0.02)",
    width: 0.3,
    connectedWidth: 0.5,
  },
  glow: {
    enabled: false,
    radiusMultiplier: 0,
    intensity: 0,
    hoveredIntensity: 0,
  },
  outline: {
    enabled: false,
    color: "transparent",
    hoveredColor: "node",
    width: 0,
    hoveredWidth: 0,
  },
  label: { color: "rgba(0,0,0,0.4)", secondary: "rgba(0,0,0,0.2)" },
  dimAlpha: 0.04,
  nodeColorOverride: "#999999",
};

export function getViewTheme(
  mode: ViewMode,
  systemIsDark: boolean,
): GraphViewTheme {
  switch (mode) {
    case "default":
      return systemIsDark ? DEFAULT_DARK : DEFAULT_LIGHT;
    case "satellite":
      return SATELLITE;
    case "constellation":
      return CONSTELLATION;
    case "blueprint":
      return BLUEPRINT;
    case "minimal":
      return systemIsDark ? MINIMAL_DARK : MINIMAL_LIGHT;
  }
}

export function themeToCSSBackground(
  theme: GraphViewTheme,
): React.CSSProperties {
  const layers: string[] = [];

  if (theme.grid) {
    const { color, spacing } = theme.grid;
    layers.push(
      `repeating-linear-gradient(0deg, ${color} 0px, ${color} 1px, transparent 1px, transparent ${spacing}px)`,
      `repeating-linear-gradient(90deg, ${color} 0px, ${color} 1px, transparent 1px, transparent ${spacing}px)`,
    );
  }

  if (theme.gradientCenter) {
    layers.push(
      `radial-gradient(circle at center, ${theme.gradientCenter}, transparent 50%)`,
    );
  }

  return {
    backgroundColor: theme.background,
    ...(layers.length > 0 ? { backgroundImage: layers.join(", ") } : {}),
  };
}
