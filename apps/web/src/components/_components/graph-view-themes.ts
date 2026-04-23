export type ViewMode =
  | "obsidian"
  | "default"
  | "satellite"
  | "constellation"
  | "blueprint"
  | "minimal";

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  obsidian: "Obsidian",
  default: "Default",
  satellite: "Satellite",
  constellation: "Constellation",
  blueprint: "Blueprint",
  minimal: "Minimal",
};

export interface EdgeColorsByType {
  tag: string;
  relates_to: string;
  wiki_parent: string;
}

export interface GraphViewTheme {
  isDarkCanvas: boolean;
  background: string;
  gradientCenter: string | null;
  grid: { color: string; spacing: number } | null;
  edge: {
    normalByType: EdgeColorsByType;
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

// Obsidian-inspired aesthetic — muted background, soft labels, very faint
// edges, and a gentle neighborhood glow. Matches the feel of Obsidian's own
// graph view: almost nothing is shouting, the structure emerges from the
// density and clustering of nodes, not from heavy ink.
const OBSIDIAN_DARK: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#1e1e1e",
  gradientCenter: null,
  grid: null,
  edge: {
    normalByType: {
      tag: "rgba(200,200,210,0.14)",
      relates_to: "rgba(255,190,130,0.5)",
      wiki_parent: "rgba(150,190,255,0.45)",
    },
    connected: "rgba(255,255,255,0.85)",
    dimmed: "rgba(255,255,255,0.02)",
    width: 0.7,
    connectedWidth: 1.4,
  },
  glow: {
    enabled: true,
    radiusMultiplier: 3.2,
    intensity: 0.12,
    hoveredIntensity: 0.45,
  },
  outline: {
    enabled: false,
    color: "transparent",
    hoveredColor: "node",
    width: 0,
    hoveredWidth: 1.5,
  },
  label: {
    color: "rgba(230,230,235,0.9)",
    secondary: "rgba(200,200,210,0.45)",
  },
  dimAlpha: 0.08,
  nodeColorOverride: null,
};

const OBSIDIAN_LIGHT: GraphViewTheme = {
  isDarkCanvas: false,
  background: "#fafaf7",
  gradientCenter: null,
  grid: null,
  edge: {
    normalByType: {
      tag: "rgba(60,60,70,0.18)",
      relates_to: "rgba(190,90,30,0.6)",
      wiki_parent: "rgba(50,90,180,0.5)",
    },
    connected: "rgba(30,30,30,0.8)",
    dimmed: "rgba(0,0,0,0.04)",
    width: 0.7,
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
    color: "rgba(0,0,0,0.08)",
    hoveredColor: "node",
    width: 0.5,
    hoveredWidth: 1.5,
  },
  label: { color: "#1a1a1a", secondary: "rgba(40,40,50,0.5)" },
  dimAlpha: 0.1,
  nodeColorOverride: null,
};

const DEFAULT_DARK: GraphViewTheme = {
  isDarkCanvas: true,
  background: "#111111",
  gradientCenter: null,
  grid: null,
  edge: {
    normalByType: {
      tag: "rgba(180,180,200,0.18)",
      relates_to: "rgba(255,170,110,0.55)",
      wiki_parent: "rgba(130,170,255,0.5)",
    },
    connected: "rgba(255,255,255,0.85)",
    dimmed: "rgba(255,255,255,0.025)",
    width: 0.8,
    connectedWidth: 1.5,
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
    normalByType: {
      tag: "rgba(60,70,90,0.22)",
      relates_to: "rgba(200,90,30,0.65)",
      wiki_parent: "rgba(60,100,200,0.55)",
    },
    connected: "rgba(0,0,0,0.75)",
    dimmed: "rgba(0,0,0,0.05)",
    width: 0.8,
    connectedWidth: 1.6,
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
    normalByType: {
      tag: "rgba(160,150,200,0.12)",
      relates_to: "rgba(255,180,120,0.55)",
      wiki_parent: "rgba(140,200,255,0.5)",
    },
    connected: "rgba(200,180,255,0.9)",
    dimmed: "rgba(255,255,255,0.015)",
    width: 0.55,
    connectedWidth: 0.8,
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
    normalByType: {
      tag: "rgba(140,180,255,0.45)",
      relates_to: "rgba(255,200,140,0.85)",
      wiki_parent: "rgba(180,220,255,0.75)",
    },
    connected: "rgba(220,235,255,0.95)",
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
    normalByType: {
      tag: "#a8b8cc",
      relates_to: "#c67b3f",
      wiki_parent: "#4a6b9a",
    },
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
    normalByType: {
      tag: "rgba(255,255,255,0.07)",
      relates_to: "rgba(230,180,130,0.4)",
      wiki_parent: "rgba(160,190,230,0.35)",
    },
    connected: "rgba(255,255,255,0.55)",
    dimmed: "rgba(255,255,255,0.01)",
    width: 0.3,
    connectedWidth: 0.8,
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
    normalByType: {
      tag: "rgba(0,0,0,0.1)",
      relates_to: "rgba(150,80,30,0.5)",
      wiki_parent: "rgba(40,70,130,0.4)",
    },
    connected: "rgba(0,0,0,0.55)",
    dimmed: "rgba(0,0,0,0.02)",
    width: 0.3,
    connectedWidth: 0.8,
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
    case "obsidian":
      return systemIsDark ? OBSIDIAN_DARK : OBSIDIAN_LIGHT;
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
