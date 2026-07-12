/**
 * Obsidian-style force model, shared by the worker simulation and the
 * main-thread fallback so the layout feel can never drift between them.
 *
 * What makes it read like Obsidian rather than a generic d3 hairball:
 *  - Link strength is DEGREE-NORMALIZED (d3's default accessor): a hub with
 *    50 links is pulled at 1/50 strength per link instead of being yanked by
 *    all of them at once. A flat strength (the old 0.6) crushed every leaf
 *    into a tight ring around its hub — the "all nodes on top of each other"
 *    look. With normalization, clusters breathe.
 *  - Link distance scales with both endpoint radii, so big hubs hold their
 *    satellites further out and labels have room.
 *  - Repulsion is strong but RANGE-BOUNDED (distanceMax, scaled with graph
 *    size via the physics profile): nodes carve out local space without every
 *    cluster shoving every other cluster across the canvas, and bounding the
 *    range prunes the dominant far-field share of many-body cost. The range
 *    MUST exceed the settled disc radius (~sqrt(n)) or the layout slowly
 *    collapses — see chargeDistanceMax in physics-profile.ts.
 *  - Centering is a weak PER-NODE pull toward the origin (forceX/forceY),
 *    like Obsidian's "Center force". The old forceCenter merely translates
 *    the whole system to keep its mean at 0 — it never pulls a disconnected
 *    component back in, which is why isolated clusters used to drift.
 *  - Collide radius matches the rendered radius (size * 2) plus breathing
 *    room, so nodes physically cannot overlap where collide is enabled.
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { PhysicsProfile } from "./physics-profile";

/** Charge slider multiplier: default scalingRatio 10 → strength -120. */
const CHARGE_MULT = 12;
/** Gravity slider multiplier: default gravity 0.5 → per-node pull 0.05. */
const CENTER_MULT = 0.1;
/** Minimum link length between two zero-size nodes. */
const LINK_DISTANCE_BASE = 40;
/** Per-endpoint contribution: distance grows 3 world units per size unit. */
const LINK_DISTANCE_SIZE_MULT = 3;
/** Breathing room added to the rendered radius for collision. */
const COLLIDE_PAD = 12;
/**
 * Obsidian-like inertia: nodes glide and spring rather than damping dead.
 * (d3 default is 0.4; the two sims previously disagreed at 0.4 vs 0.5.)
 */
export const VELOCITY_DECAY = 0.3;

interface PhysicsNode extends SimulationNodeDatum {
  id: string;
  size: number;
}

/** Resolves a link endpoint to its size (0 until d3 binds id → node). */
function endpointSize(endpoint: PhysicsNode | string | number): number {
  return typeof endpoint === "object" ? endpoint.size : 0;
}

export interface GraphForces<
  N extends PhysicsNode,
  L extends SimulationLinkDatum<N>,
> {
  link: ReturnType<typeof forceLink<N, L>>;
  charge: ReturnType<typeof forceManyBody<N>>;
  centerX: ReturnType<typeof forceX<N>>;
  centerY: ReturnType<typeof forceY<N>>;
  collide: ReturnType<typeof forceCollide<N>> | null;
  /** Wire the scalingRatio settings slider to the charge force. */
  setStrength: (scalingRatio: number) => void;
  /** Wire the gravity settings slider to the centering pull. */
  setGravity: (gravity: number) => void;
}

export function createGraphForces<
  N extends PhysicsNode,
  L extends SimulationLinkDatum<N>,
>(
  structuralEdges: L[],
  scalingRatio: number,
  gravity: number,
  profile: PhysicsProfile,
): GraphForces<N, L> {
  // No .strength() override — d3's default (1 / min(endpoint degree)) is the
  // degree normalization described above.
  const link = forceLink<N, L>(structuralEdges)
    .id((d) => d.id)
    .distance(
      (l) =>
        LINK_DISTANCE_BASE +
        (endpointSize(l.source) + endpointSize(l.target)) *
          LINK_DISTANCE_SIZE_MULT,
    );

  const charge = forceManyBody<N>()
    .strength(-scalingRatio * CHARGE_MULT)
    .theta(profile.theta)
    .distanceMax(profile.chargeDistanceMax);

  const centerX = forceX<N>(0).strength(gravity * CENTER_MULT);
  const centerY = forceY<N>(0).strength(gravity * CENTER_MULT);

  const collide = profile.collideEnabled
    ? forceCollide<N>()
        .radius((d) => d.size * 2 + COLLIDE_PAD)
        .strength(1)
        .iterations(profile.collideIterations)
    : null;

  return {
    link,
    charge,
    centerX,
    centerY,
    collide,
    setStrength: (s: number) => {
      charge.strength(-s * CHARGE_MULT);
    },
    setGravity: (g: number) => {
      centerX.strength(g * CENTER_MULT);
      centerY.strength(g * CENTER_MULT);
    },
  };
}
