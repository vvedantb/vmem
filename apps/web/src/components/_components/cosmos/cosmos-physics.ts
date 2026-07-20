import type { GraphSettings } from "@/lib/graph/graph-types";

/**
 * Map legacy GraphCanvas physics (d3-force + physics-profile) onto Cosmos GL knobs.
 *
 * Legacy settles via alphaDecay + velocityDecay (0.3) and sleeps below SLEEP_ALPHA.
 * Cosmos uses simulationDecay (bigger = cools slower) and simulationFriction
 * (lower = more damping / inert — see cosmos.gl README).
 */
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
  /** Cosmos types this as number (0 = off); strength when on. */
  simulationCollision: number;
  simulationCollisionPadding: number;
}

/** Mild reheat when the user moves Spread/Gravity — mirrors legacy `reheat()`. */
export const COSMOS_SETTINGS_REHEAT_ALPHA = 0.25;
export const COSMOS_INITIAL_SETTLE_ALPHA = 0.08;

export function cosmosWarmupTicks(nodeCount: number): number {
  if (nodeCount <= 2000) return 150;
  if (nodeCount <= 10_000) return 60;
  if (nodeCount <= 30_000) return 25;
  return 10;
}

export function cosmosPhysicsFromSettings(
  settings: GraphSettings,
  nodeCount: number,
): CosmosPhysicsConfig {
  // Legacy: charge strength ≈ -(scalingRatio * 12); Cosmos repulsion is 0–2.
  const baseRepulsion = Math.min(2, Math.max(0.1, settings.scalingRatio / 10));
  const simulationRepulsion =
    nodeCount <= 10
      ? baseRepulsion * 0.18
      : nodeCount <= 50
        ? baseRepulsion * 0.32
        : nodeCount <= 200
          ? baseRepulsion * 0.55
          : baseRepulsion;
  // Legacy gravity 0.5 → center pull ~0.05; Cosmos gravity/center are 0–1.
  const simulationGravity = Math.min(
    1,
    Math.max(0.01, settings.gravity * 0.25),
  );
  const simulationCenter = Math.min(1, Math.max(0, settings.gravity * 0.1));

  // Faster cool-down than Cosmos default (5000); scales with graph size like physicsProfile.
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
    // Default 0.85 stays "slippery"; lower = more damping (cosmos README: 0.1 inert).
    simulationFriction: 0.35,
    simulationDecay,
    simulationRepulsionTheta,
    simulationRepulsionFromMouse: 0,
    simulationLinkSpring: 1,
    simulationLinkDistance:
      nodeCount <= 10 ? 3 : nodeCount <= 50 ? 5 : nodeCount <= 200 ? 7 : 10,
    simulationCollision,
    // Legacy collide pad was ~12 world units; Cosmos padding is relative to point size.
    simulationCollisionPadding: 0.35,
  };
}
