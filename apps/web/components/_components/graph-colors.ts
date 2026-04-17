/**
 * Shared color utilities for graph nodes.
 * Used by both the canvas renderer and UI components (tag filters, legend).
 */
import type { GraphNodeKind } from "./canvas/types";

export function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function tagToColor(tag: string, isDark: boolean): string {
  const hue = tagToHue(tag);
  return isDark ? hslToHex(hue, 50, 72) : hslToHex(hue, 55, 48);
}

/**
 * Fixed colors for wiki nodes. Wiki nodes have no tags so we pick kind-based
 * colors from the same HSL space used by `tagToColor` to stay visually coherent
 * with the rest of the palette. Documents read as "content" (warm accent),
 * folders read as "structure" (cool neutral).
 */
function wikiKindColor(kind: "wiki-document" | "wiki-folder", isDark: boolean) {
  if (kind === "wiki-folder") {
    return isDark ? hslToHex(220, 15, 65) : hslToHex(220, 20, 45);
  }
  return isDark ? hslToHex(35, 55, 70) : hslToHex(35, 60, 50);
}

/**
 * Color for a node based on its kind, tags, and theme. Used by renderer and UI.
 *
 * - Memory nodes: first tag drives the hue (falls back to a theme-aware grey).
 * - Wiki nodes: fixed kind-based color (no tags on wiki today).
 * - `nodeColorOverride` from a view theme (e.g. monochrome themes) wins for all.
 */
export function nodeColor(
  tags: string[],
  kind: GraphNodeKind,
  isDarkCanvas: boolean,
  nodeColorOverride: string | null,
): string {
  if (nodeColorOverride) return nodeColorOverride;
  if (kind !== "memory") return wikiKindColor(kind, isDarkCanvas);
  if (tags.length > 0) return tagToColor(tags[0], isDarkCanvas);
  return isDarkCanvas ? "#555566" : "#999999";
}
