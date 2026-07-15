// simulation controller — wraps d3-force in a Web Worker for off-main-thread physics
import { forceSimulation } from "d3-force";
import type { GraphNode, GraphEdge } from "./types";
import { physicsProfile } from "./physics-profile";
import { createGraphForces, VELOCITY_DECAY } from "./physics-forces";

// below this alpha the layout is visually static
export const SLEEP_ALPHA = 0.005;

type WorkerPositionMessage = {
  type: "positions";
  buffer: Float32Array;
  alpha: number;
};

export interface SimulationController {
  // current simulation alpha (convergence indicator, 0 = stable)
  alpha: () => number;
  // monotonic counter, bumped each time node positions actually change (worker
  positionsVersion: () => number;
  // tick the simulation once — no-op for Worker mode (worker ticks itself)
  tick: () => void;
  reheat: () => void;
  setStrength: (scalingRatio: number) => void;
  setGravity: (gravity: number) => void;
  // fix a node in place at the given position (drag start)
  dragStart: (nodeId: string, x: number, y: number) => void;
  // move a fixed/dragged node to a new position
  dragMove: (nodeId: string, x: number, y: number) => void;
  // release a fixed node (drag end)
  dragEnd: (nodeId: string) => void;
  stop: () => void;
}

// creates a simulation controller
export function createSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  scalingRatio: number,
  gravity: number,
): SimulationController {
  try {
    return createWorkerSimulation(nodes, edges, scalingRatio, gravity);
  } catch (err) {
    console.warn(
      "[simulation] Worker creation failed, using main thread:",
      err,
    );
    return createMainThreadSimulation(nodes, edges, scalingRatio, gravity);
  }
}

// ------ Worker-backed simulation ------

// golden angle for spiral layout — optimal packing like sunflower seeds
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// computes golden spiral position for a node at index i of n total nodes
function goldenSpiralPosition(
  index: number,
  total: number,
): { x: number; y: number } {
  const scale = Math.sqrt(total) * 40;
  const angle = index * GOLDEN_ANGLE;
  const radius = scale * Math.sqrt((index + 1) / total);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function seedNodePositions(nodes: GraphNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    if (node.x === undefined || node.y === undefined) {
      const spiral = goldenSpiralPosition(i, nodes.length);
      node.x = spiral.x;
      node.y = spiral.y;
    }
  }
}

function createWorkerSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  scalingRatio: number,
  gravity: number,
): SimulationController {
  seedNodePositions(nodes);

  // type: "module" is load-bearing
  const worker = new Worker(
    new URL("./simulation-worker.ts", import.meta.url),
    { type: "module" },
  );

  let currentAlpha = 1;
  let positionsVersion = 0;

  // build node index for fast lookups when applying position updates
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // lightweight node data for the worker (strip d3 simulation properties)
  // use golden spiral for initial positions instead of random — reduces chaos
  const workerNodes = nodes.map((n, i) => {
    const spiral = goldenSpiralPosition(i, nodes.length);
    return {
      id: n.id,
      size: n.size,
      x: n.x ?? spiral.x,
      y: n.y ?? spiral.y,
    };
  });

  // resolve edge source/target to string IDs
  const workerEdges = edges.map((e) => ({
    source: typeof e.source === "string" ? e.source : e.source.id,
    target: typeof e.target === "string" ? e.target : e.target.id,
    edgeType: e.edgeType,
    weight: e.weight,
  }));

  // initialize the worker simulation
  worker.postMessage({
    type: "init",
    nodes: workerNodes,
    edges: workerEdges,
    scalingRatio,
    gravity,
  });

  // apply position updates from worker to main-thread node objects
  worker.onmessage = (e: MessageEvent<WorkerPositionMessage>) => {
    const msg = e.data;
    if (msg.type === "positions") {
      const buffer = msg.buffer;
      currentAlpha = msg.alpha;
      positionsVersion++;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        // don't overwrite position of a node being dragged (main thread has authority)
        if (node.fx !== undefined && node.fx !== null) continue;
        node.x = buffer[i * 2];
        node.y = buffer[i * 2 + 1];
      }
    }
  };

  // worker failures are ASYNC (script load/parse errors never hit the sync try/catch in
  let fallback: SimulationController | null = null;
  let stopped = false;
  worker.onerror = (event: ErrorEvent) => {
    if (fallback || stopped) return;
    console.warn(
      "[simulation] Worker failed, falling back to main thread:",
      event.message,
    );
    worker.terminate();
    fallback = createMainThreadSimulation(nodes, edges, scalingRatio, gravity);
  };

  return {
    alpha: () => (fallback ? fallback.alpha() : currentAlpha),

    positionsVersion: () =>
      fallback ? fallback.positionsVersion() : positionsVersion,

    // no-op in worker mode (worker ticks itself); drives the fallback sim
    tick: () => fallback?.tick(),

    reheat: () => {
      if (fallback) return fallback.reheat();
      worker.postMessage({ type: "reheat" });
    },

    setStrength: (s: number) => {
      if (fallback) return fallback.setStrength(s);
      worker.postMessage({ type: "setStrength", scalingRatio: s });
    },

    setGravity: (g: number) => {
      if (fallback) return fallback.setGravity(g);
      worker.postMessage({ type: "setGravity", gravity: g });
    },

    dragStart: (nodeId: string, x: number, y: number) => {
      if (fallback) return fallback.dragStart(nodeId, x, y);
      // set on main thread for immediate visual feedback
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      worker.postMessage({ type: "dragStart", nodeId, x, y });
    },

    dragMove: (nodeId: string, x: number, y: number) => {
      if (fallback) return fallback.dragMove(nodeId, x, y);
      const node = nodeById.get(nodeId);
      if (node) {
        node.x = x;
        node.y = y;
        node.fx = x;
        node.fy = y;
      }
      worker.postMessage({ type: "dragMove", x, y });
    },

    dragEnd: (nodeId: string) => {
      if (fallback) return fallback.dragEnd(nodeId);
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      worker.postMessage({ type: "dragEnd", nodeId });
    },

    stop: () => {
      stopped = true;
      if (fallback) return fallback.stop();
      worker.terminate();
    },
  };
}

// ------ Main-thread fallback (same as original, with drag methods) ------

function createMainThreadSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  scalingRatio: number,
  gravity: number,
): SimulationController {
  seedNodePositions(nodes);

  const profile = physicsProfile(nodes.length);

  // only structural edges participate in physics — tag edges are visual-only
  const structuralEdges = edges.filter((e) => e.edgeType !== "tag");

  const forces = createGraphForces<GraphNode, GraphEdge>(
    structuralEdges,
    scalingRatio,
    gravity,
    profile,
  );

  // .stop() kills d3's internal timer
  const simulation = forceSimulation<GraphNode, GraphEdge>(nodes)
    .force("link", forces.link)
    .force("charge", forces.charge)
    .force("centerX", forces.centerX)
    .force("centerY", forces.centerY)
    .alphaDecay(profile.alphaDecay)
    .velocityDecay(VELOCITY_DECAY)
    .stop();

  if (forces.collide) {
    simulation.force("collide", forces.collide);
  }

  // warm-up (main thread — blocks, so the adaptive tick count matters even
  // more here than in the worker path)
  for (let i = 0; i < profile.warmupTicks; i++) {
    simulation.tick();
  }
  simulation.alpha(0.2);

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  let positionsVersion = 0;

  return {
    alpha: () => simulation.alpha(),

    positionsVersion: () => positionsVersion,

    tick() {
      // sleep gate: skip force passes once settled, unless a drag is holding
      // alphaTarget above zero
      if (simulation.alpha() < SLEEP_ALPHA && simulation.alphaTarget() === 0)
        return;
      simulation.tick();
      positionsVersion++;
    },

    reheat() {
      const current = simulation.alpha();
      simulation.alpha(Math.max(current, 0.1));
    },

    setStrength(s: number) {
      forces.setStrength(s);
      simulation.alpha(0.3);
    },

    setGravity(g: number) {
      forces.setGravity(g);
      simulation.alpha(0.3);
    },

    dragStart(nodeId: string, x: number, y: number) {
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      // keep the sim warm during the drag so neighbours react (and the
      // sleep gate in tick() stays open)
      simulation.alphaTarget(0.3);
    },

    dragMove(nodeId: string, x: number, y: number) {
      const node = nodeById.get(nodeId);
      if (node) {
        node.x = x;
        node.y = y;
        node.fx = x;
        node.fy = y;
      }
    },

    dragEnd(nodeId: string) {
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      simulation.alphaTarget(0);
    },

    stop() {
      simulation.stop();
    },
  };
}
