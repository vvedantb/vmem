/**
 * Node-count-adaptive physics parameters, shared by the worker simulation and
 * the main-thread fallback so both degrade identically.
 *
 * d3-force tick cost grows superlinearly with node count (quadtree build +
 * traversal per force, collide × iterations). The fixed "small graph" profile
 * that feels organic at 2k nodes takes minutes of warm-up at 100k — so larger
 * graphs trade layout finesse for responsiveness:
 *  - fewer warm-up ticks (the canvas shows the seeded spiral immediately and
 *    the layout morphs into place instead of blocking)
 *  - collide drops to 1 iteration, then off entirely (sub-pixel overlap is
 *    invisible at the zoom levels where 20k+ nodes fit on screen)
 *  - faster alpha decay so the simulation settles (and sleeps) in fewer ticks
 *  - higher Barnes-Hut theta (coarser long-range approximation)
 *  - fewer physics ticks per posted frame and a slower posting cadence
 */
export interface PhysicsProfile {
  warmupTicks: number;
  collideEnabled: boolean;
  collideIterations: number;
  alphaDecay: number;
  theta: number;
  ticksPerFrame: number;
  tickIntervalMs: number;
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
  };
}
