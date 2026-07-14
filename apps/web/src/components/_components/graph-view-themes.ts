interface EdgeColorsByType {
  tag: string;
  relates_to: string;
  wiki_parent: string;
  mentions: string;
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
    // node" reuses the node's own colour; otherwise a literal colour string
    hoveredColor: string;
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
    normalByType: {
      tag: "rgba(180,180,200,0.18)",
      relates_to: "rgba(255,170,110,0.55)",
      wiki_parent: "rgba(130,170,255,0.5)",
      mentions: "rgba(100,200,160,0.45)",
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
  background: "#f7f7f8",
  gradientCenter: null,
  grid: null,
  edge: {
    normalByType: {
      tag: "rgba(60,70,90,0.22)",
      relates_to: "rgba(200,90,30,0.65)",
      wiki_parent: "rgba(60,100,200,0.55)",
      mentions: "rgba(30,140,100,0.55)",
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

export function getViewTheme(systemIsDark: boolean): GraphViewTheme {
  return systemIsDark ? DEFAULT_DARK : DEFAULT_LIGHT;
}
