/**
 * Shared cosmos.gl graph tuning: tag colours, RGBA packing, physics and label
 * truncation.
 *
 * Two renderers draw the same memory graph — the dashboard canvas in
 * `apps/web` and the standalone MCP UI bundle in `packages/backend/mcp-ui` —
 * and they must look and behave identically. Put anything they both need here.
 *
 * Keep this module dependency-free: it is bundled into the MCP UI IIFE, and it
 * is a separate entry point from `@vmem/shared` precisely so the dayjs setup in
 * `time.ts` does not get dragged along with it.
 */

export type Rgba = [number, number, number, number];

// ── Tag colours ──────────────────────────────────────────────────────────────

// Both renderers derive a node's colour from the hue of its first tag, so the
// hash and the saturation/lightness pairs have to agree exactly.
const TAG_SATURATION_DARK = 50;
const TAG_LIGHTNESS_DARK = 72;
const TAG_SATURATION_LIGHT = 55;
const TAG_LIGHTNESS_LIGHT = 48;

export function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

// shared hsl → rgb core, channels as 0–1 floats
function hslChannels(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const sat = s / 100;
  const lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const c = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.min(1, Math.max(0, c));
  };
  return [f(0), f(8), f(4)];
}

export function hslToHex(h: number, s: number, l: number): string {
  const channels = hslChannels(h, s, l);
  const hex = channels
    .map((c) =>
      Math.round(255 * c)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return `#${hex}`;
}

export function hslToRgba(h: number, s: number, l: number): Rgba {
  const [r, g, b] = hslChannels(h, s, l);
  return [r, g, b, 1];
}

function tagHsl(tag: string, isDark: boolean): [number, number, number] {
  const hue = tagToHue(tag);
  return isDark
    ? [hue, TAG_SATURATION_DARK, TAG_LIGHTNESS_DARK]
    : [hue, TAG_SATURATION_LIGHT, TAG_LIGHTNESS_LIGHT];
}

export function tagToColor(tag: string, isDark: boolean): string {
  const [h, s, l] = tagHsl(tag, isDark);
  return hslToHex(h, s, l);
}

export function tagToRgba(tag: string, isDark: boolean): Rgba {
  const [h, s, l] = tagHsl(tag, isDark);
  return hslToRgba(h, s, l);
}

export function writeRgba(
  target: Float32Array,
  offset: number,
  rgba: Rgba,
): void {
  target[offset] = rgba[0];
  target[offset + 1] = rgba[1];
  target[offset + 2] = rgba[2];
  target[offset + 3] = rgba[3];
}

// ── Physics ──────────────────────────────────────────────────────────────────

// fixed cosmos gl physics knobs (tuned from the old default spread=10 / gravity=0.5)
// scales a few values with graph size only, no user, facing force controls
export interface CosmosPhysicsConfig {
  simulationRepulsion: number;
  simulationGravity: number;
  simulationCenter: number;
  simulationFriction: number;
  simulationDecay: number;
  simulationRepulsionTheta: number;
  simulationRepulsionFromMouse: number;
  simulationLinkSpring: number;
  simulationLinkDistance: number;
  // cosmos types this as number (0 = off), strength when on
  simulationCollision: number;
  simulationCollisionPadding: number;
}

export const COSMOS_INITIAL_SETTLE_ALPHA = 0.08;
// mild reheat after drag (same feel as the old settings reheat)
export const COSMOS_DRAG_REHEAT_ALPHA = 0.25;

export function cosmosWarmupTicks(nodeCount: number): number {
  if (nodeCount <= 2000) return 150;
  if (nodeCount <= 10_000) return 60;
  if (nodeCount <= 30_000) return 25;
  return 10;
}

export function cosmosPhysicsForNodeCount(
  nodeCount: number,
): CosmosPhysicsConfig {
  // Former defaults: scalingRatio 10 → repulsion 1; gravity 0.5 → 0.125 / 0.05
  const baseRepulsion = 1;
  const simulationRepulsion =
    nodeCount <= 10
      ? baseRepulsion * 0.18
      : nodeCount <= 50
        ? baseRepulsion * 0.32
        : nodeCount <= 200
          ? baseRepulsion * 0.55
          : baseRepulsion;
  const simulationGravity = 0.125;
  const simulationCenter = 0.05;

  let simulationDecay: number;
  let simulationRepulsionTheta: number;
  let simulationCollision: number;
  if (nodeCount <= 2000) {
    simulationDecay = 400;
    simulationRepulsionTheta = 0.9;
    simulationCollision = 1;
  } else if (nodeCount <= 10_000) {
    simulationDecay = 700;
    simulationRepulsionTheta = 1.2;
    simulationCollision = 1;
  } else {
    simulationDecay = 1200;
    simulationRepulsionTheta = 1.5;
    simulationCollision = 0;
  }

  return {
    simulationRepulsion,
    simulationGravity,
    simulationCenter,
    simulationFriction: 0.35,
    simulationDecay,
    simulationRepulsionTheta,
    simulationRepulsionFromMouse: 0,
    simulationLinkSpring: 1,
    simulationLinkDistance:
      nodeCount <= 10 ? 3 : nodeCount <= 50 ? 5 : nodeCount <= 200 ? 7 : 10,
    simulationCollision,
    simulationCollisionPadding: 0.35,
  };
}

// ── Labels ───────────────────────────────────────────────────────────────────

const LABEL_MAX_CHARS = 26;

export function truncateCosmosLabel(title: string): string {
  if (title.length <= LABEL_MAX_CHARS) return title;
  return `${title.slice(0, LABEL_MAX_CHARS - 1)}…`;
}
