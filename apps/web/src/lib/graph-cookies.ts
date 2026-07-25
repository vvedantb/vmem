import { z } from "zod";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "@/lib/graph/graph-types";

const COOKIE_KEY = "vmem-graph-settings";
const MAX_AGE = 60 * 60 * 24 * 365;

const graphSettingsCookieSchema = z.object({
  scalingRatio: z.number().finite().optional(),
  gravity: z.number().finite().optional(),
  showLabels: z.boolean().optional(),
});

export function getGraphSettings(): GraphSettings {
  if (typeof document === "undefined") return DEFAULT_GRAPH_SETTINGS;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));

  if (!match) return DEFAULT_GRAPH_SETTINGS;

  try {
    const raw = match.split("=").slice(1).join("=");
    if (raw.length === 0) return DEFAULT_GRAPH_SETTINGS;
    const parsed = graphSettingsCookieSchema.safeParse(
      JSON.parse(decodeURIComponent(raw)),
    );
    if (!parsed.success) return DEFAULT_GRAPH_SETTINGS;
    return { ...DEFAULT_GRAPH_SETTINGS, ...parsed.data };
  } catch {
    return DEFAULT_GRAPH_SETTINGS;
  }
}

export function setGraphSettings(settings: GraphSettings): void {
  const value = encodeURIComponent(JSON.stringify(settings));
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}
