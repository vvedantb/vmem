import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "@/components/_components/graph-types";

const COOKIE_KEY = "vmem-graph-settings";
const MAX_AGE = 60 * 60 * 24 * 365;

export function getGraphSettings(): GraphSettings {
  if (typeof document === "undefined") return DEFAULT_GRAPH_SETTINGS;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));

  if (!match) return DEFAULT_GRAPH_SETTINGS;

  try {
    const parsed = JSON.parse(decodeURIComponent(match.split("=")[1]));
    const num = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      scalingRatio: num(
        parsed.scalingRatio,
        DEFAULT_GRAPH_SETTINGS.scalingRatio,
      ),
      gravity: num(parsed.gravity, DEFAULT_GRAPH_SETTINGS.gravity),
      repulsion: num(parsed.repulsion, DEFAULT_GRAPH_SETTINGS.repulsion),
      damping: num(parsed.damping, DEFAULT_GRAPH_SETTINGS.damping),
    };
  } catch {
    return DEFAULT_GRAPH_SETTINGS;
  }
}

export function setGraphSettings(settings: GraphSettings): void {
  const value = encodeURIComponent(JSON.stringify(settings));
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}
