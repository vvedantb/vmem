// node-count-adaptive physics params shared by worker + main-thread fallback
export interface PhysicsProfile {
  warmupTicks: number;
  collideEnabled: boolean;
  collideIterations: number;
  alphaDecay: number;
  theta: number;
  ticksPerFrame: number;
  tickIntervalMs: number;
  // repulsion range for forceManyBody.distanceMax, in world units
  chargeDistanceMax: number;
}

export function physicsProfile(nodeCount: number): PhysicsProfile {
  if (nodeCount <= 2000) {
    return {
      warmupTicks: 150,
      collideEnabled: true,
      collideIterations: 3,
      alphaDecay: 0.0228,
      theta: 0.9,
      ticksPerFrame: 2,
      tickIntervalMs: 33,
      chargeDistanceMax: 1500,
    };
  }
  if (nodeCount <= 10_000) {
    return {
      warmupTicks: 60,
      collideEnabled: true,
      collideIterations: 1,
      alphaDecay: 0.035,
      theta: 1.2,
      ticksPerFrame: 1,
      tickIntervalMs: 33,
      chargeDistanceMax: 3500,
    };
  }
  if (nodeCount <= 30_000) {
    return {
      warmupTicks: 25,
      collideEnabled: false,
      collideIterations: 1,
      alphaDecay: 0.05,
      theta: 1.5,
      ticksPerFrame: 1,
      tickIntervalMs: 50,
      chargeDistanceMax: 6000,
    };
  }
  return {
    warmupTicks: 10,
    collideEnabled: false,
    collideIterations: 1,
    alphaDecay: 0.08,
    theta: 1.8,
    ticksPerFrame: 1,
    tickIntervalMs: 66,
    chargeDistanceMax: 10_000,
  };
}
