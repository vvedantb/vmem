/**
 * Shared color utilities for graph nodes.
 * Used by both the canvas renderer and UI components (tag filters, legend).
 */
import type { GraphNodeKind } from "./canvas/types";

function themeColor(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value.length > 0 ? value : fallback;
}

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
 * Fixed colors for tagless node kinds. Picks from the same HSL space used by
 * `tagToColor` to stay visually coherent with the rest of the palette.
 * Hue cheat-sheet:
 *  - wiki-document: warm amber (content accent)
 *  - wiki-folder:   cool slate (structural)
 *  - skill:         purple (tool/capability)
 *  - entity:        gold (named-entity accent)
 *  - code-file:      teal     (structural file surface)
 *  - code-function:  green    (executable behaviour)
 *  - code-class:     indigo   (type/abstraction)
 *  - code-interface: pink     (contract/abstraction)
 *  - code-process:   orange   (entry-point burst — high salience)
 */
function kindColor(
  kind: Exclude<GraphNodeKind, "memory">,
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
  if (kind === "code-file") {
    return isDark ? hslToHex(180, 40, 65) : hslToHex(180, 45, 42);
  }
  if (kind === "code-function") {
    return isDark ? hslToHex(150, 45, 62) : hslToHex(150, 50, 40);
  }
  if (kind === "code-class") {
    return isDark ? hslToHex(245, 50, 70) : hslToHex(245, 55, 50);
  }
  if (kind === "code-interface") {
    return isDark ? hslToHex(330, 55, 70) : hslToHex(330, 60, 52);
  }
  if (kind === "code-process") {
    return isDark ? hslToHex(25, 70, 65) : hslToHex(25, 75, 50);
  }
  // wiki-document fallback
  return isDark ? hslToHex(35, 55, 70) : hslToHex(35, 60, 50);
}

/**
 * Color for a node based on its kind, tags, and theme. Used by renderer and UI.
 *
 * - Memory nodes: first tag drives the hue (falls back to a theme-aware grey).
 * - Non-memory kinds: fixed kind-based color.
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
  return themeColor("--muted", isDarkCanvas ? "#888888" : "#999999");
}
