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
 * Fixed colors for tagless node kinds (wiki docs, wiki folders, skills). Picks
 * from the same HSL space used by `tagToColor` to stay visually coherent with
 * the rest of the palette:
 *  - wiki-document: warm amber (content accent)
 *  - wiki-folder:   cool slate (structural)
 *  - skill:         purple (tool/capability)
 */
function kindColor(
  kind: "wiki-document" | "wiki-folder" | "skill" | "entity",
  isDark: boolean,
): string {
  if (kind === "wiki-folder") {
    return isDark ? hslToHex(220, 15, 65) : hslToHex(220, 20, 45);
  }
  if (kind === "skill") {
    return isDark ? hslToHex(285, 55, 72) : hslToHex(285, 60, 50);
  }
  if (kind === "entity") {
    return isDark ? hslToHex(45, 70, 65) : hslToHex(45, 75, 45);
  }
  return isDark ? hslToHex(35, 55, 70) : hslToHex(35, 60, 50);
}

/**
 * Color for a node based on its kind, tags, and theme. Used by renderer and UI.
 *
 * - Memory nodes: first tag drives the hue (falls back to a theme-aware grey).
 * - Non-memory kinds (wiki docs, wiki folders, skills): fixed kind-based color.
 * - `nodeColorOverride` from a view theme (e.g. monochrome themes) wins for all.
 */
export function nodeColor(
  tags: string[],
  kind: GraphNodeKind,
  isDarkCanvas: boolean,
  nodeColorOverride: string | null,
): string {
  if (nodeColorOverride) return nodeColorOverride;
  if (kind !== "memory") return kindColor(kind, isDarkCanvas);
  if (tags.length > 0) return tagToColor(tags[0], isDarkCanvas);
  return isDarkCanvas ? "#555566" : "#999999";
}
