// graph node colors (canvas + tag filters / legend)
// tag hue hashing + hsl conversion are shared with the MCP UI graph renderer
import { hslToHex, tagToColor } from "@vmem/shared/graph";
import type { GraphNodeKind } from "@/lib/graph/types";

export { tagToColor };

function themeColor(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value.length > 0 ? value : fallback;
}

// fixed hsl colors for tagless node kinds (matches tagToColor space)
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
  // wiki document fallback
  return isDark ? hslToHex(35, 55, 70) : hslToHex(35, 60, 50);
}

// memory first tag hue other kinds fixed theme override wins
export function nodeColor(
  tags: string[],
  kind: GraphNodeKind,
  isDarkCanvas: boolean,
  nodeColorOverride: string | null,
): string {
  if (nodeColorOverride) return nodeColorOverride;
  if (kind !== "memory") return kindColor(kind, isDarkCanvas);
  const firstTag = tags.at(0);
  if (firstTag !== undefined) return tagToColor(firstTag, isDarkCanvas);
  return themeColor("--muted", isDarkCanvas ? "#888888" : "#999999");
}
