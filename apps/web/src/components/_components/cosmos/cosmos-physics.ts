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
