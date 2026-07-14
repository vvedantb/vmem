// shared force model for worker + main-thread simulation (obsidian-style)
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

// charge slider: default scalingRatio 10 → strength -120
const CHARGE_MULT = 12;
// gravity slider: default gravity 0.5 → per-node pull 0.05
const CENTER_MULT = 0.1;
// min link length between zero-size nodes
const LINK_DISTANCE_BASE = 40;
// link length grows 3 world units per size unit per endpoint
const LINK_DISTANCE_SIZE_MULT = 3;
// collide pad beyond rendered radius
const COLLIDE_PAD = 12;
// soft inertia (obsidian-like); d3 default is 0.4
export const VELOCITY_DECAY = 0.3;

interface PhysicsNode extends SimulationNodeDatum {
  id: string;
  size: number;
}

// link endpoint size (0 until d3 binds id → node)
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
  // wire the scalingRatio settings slider to the charge force
  setStrength: (scalingRatio: number) => void;
  // wire the gravity settings slider to the centering pull
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
  // no .strength() override — d3's default (1 / min(endpoint degree)) is the
  // degree normalization described above
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
