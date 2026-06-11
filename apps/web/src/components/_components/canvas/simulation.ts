/**
 * Simulation controller — wraps d3-force in a Web Worker for off-main-thread physics.
 * Falls back to main-thread simulation if Worker creation fails.
 */
import { forceSimulation } from "d3-force";
import type { GraphNode, GraphEdge } from "./types";
import { physicsProfile } from "./physics-profile";
import { createGraphForces, VELOCITY_DECAY } from "./physics-forces";

/**
 * Below this alpha the layout is visually static. The worker stops its tick
 * interval, and GraphCanvas skips rendering, when alpha is under this value.
 * Must match SLEEP_ALPHA in simulation-worker.ts.
 */
export const SLEEP_ALPHA = 0.005;

type WorkerPositionMessage = {
  type: "positions";
  buffer: Float32Array;
  alpha: number;
};

export interface SimulationController {
  /** Current simulation alpha (convergence indicator, 0 = stable) */
  alpha: () => number;
  /**
   * Monotonic counter, bumped each time node positions actually change
   * (worker position message / fallback tick). The worker posts at ~30Hz
   * while the rAF loop runs at 60 — rendering settle frames whose positions
   * have not changed is pure waste, so GraphCanvas repaints the hot layout
   * only when this advances.
   */
  positionsVersion: () => number;
  /** Tick the simulation once — no-op for Worker mode (worker ticks itself) */
  tick: () => void;
  reheat: () => void;
  setStrength: (scalingRatio: number) => void;
  setGravity: (gravity: number) => void;
  /** Fix a node in place at the given position (drag start) */
  dragStart: (nodeId: string, x: number, y: number) => void;
  /** Move a fixed/dragged node to a new position */
  dragMove: (nodeId: string, x: number, y: number) => void;
  /** Release a fixed node (drag end) */
  dragEnd: (nodeId: string) => void;
  updateData: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  stop: () => void;
}

/**
 * Creates a simulation controller. Tries Worker first, falls back to main-thread.
 */
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

// Golden angle for spiral layout — optimal packing like sunflower seeds
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Computes golden spiral position for a node at index i of n total nodes.
 * Returns [x, y] centered at origin.
 */
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
    if (nodes[i].x === undefined || nodes[i].y === undefined) {
      const spiral = goldenSpiralPosition(i, nodes.length);
      nodes[i].x = spiral.x;
      nodes[i].y = spiral.y;
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

  // type: "module" is load-bearing: the worker source uses ESM imports, and a
  // classic worker dies on its first `import` with an ASYNC SyntaxError that
  // the try/catch around createSimulation never sees — no physics, and alpha
  // stays 1 forever so GraphCanvas full-renders every frame (no blit, no
  // idle sleep). The onerror fallback below guards the same failure mode.
  const worker = new Worker(
    new URL("./simulation-worker.ts", import.meta.url),
    { type: "module" },
  );

  let currentAlpha = 1;
  let positionsVersion = 0;

  // Build node index for fast lookups when applying position updates
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Lightweight node data for the worker (strip d3 simulation properties)
  // Use golden spiral for initial positions instead of random — reduces chaos
  const workerNodes = nodes.map((n, i) => {
    const spiral = goldenSpiralPosition(i, nodes.length);
    return {
      id: n.id,
      size: n.size,
      x: n.x ?? spiral.x,
      y: n.y ?? spiral.y,
    };
  });

  // Resolve edge source/target to string IDs
  const workerEdges = edges.map((e) => ({
    source: typeof e.source === "string" ? e.source : e.source.id,
    target: typeof e.target === "string" ? e.target : e.target.id,
    edgeType: e.edgeType,
    weight: e.weight,
  }));

  // Initialize the worker simulation
  worker.postMessage({
    type: "init",
    nodes: workerNodes,
    edges: workerEdges,
    scalingRatio,
    gravity,
  });

  // Apply position updates from worker to main-thread node objects
  worker.onmessage = (e: MessageEvent<WorkerPositionMessage>) => {
    const msg = e.data;
    if (msg.type === "positions") {
      const buffer = msg.buffer;
      currentAlpha = msg.alpha;
      positionsVersion++;
      for (let i = 0; i < nodes.length; i++) {
        // Don't overwrite position of a node being dragged (main thread has authority)
        if (nodes[i].fx !== undefined && nodes[i].fx !== null) continue;
        nodes[i].x = buffer[i * 2];
        nodes[i].y = buffer[i * 2 + 1];
      }
    }
  };

  // Worker failures are ASYNC (script load/parse errors never hit the sync
  // try/catch in createSimulation). Without this fallback a dead worker means
  // no physics AND currentAlpha pinned at 1 — which keeps GraphCanvas's
  // positionsMoving true so every frame full-renders forever. Swap to the
  // main-thread simulation instead; every controller method delegates.
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

    // No-op in worker mode (worker ticks itself); drives the fallback sim.
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
      // Set on main thread for immediate visual feedback
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

    updateData: (newNodes: GraphNode[], newEdges: GraphEdge[]) => {
      if (fallback) return fallback.updateData(newNodes, newEdges);
      // Full re-init: terminate and restart would be simpler,
      // but the effect in GraphCanvas.tsx already recreates the simulation on data change.
      // This is here for interface compatibility.
      worker.postMessage({
        type: "init",
        nodes: newNodes.map((n, i) => {
          const spiral = goldenSpiralPosition(i, newNodes.length);
          return {
            id: n.id,
            size: n.size,
            x: n.x ?? spiral.x,
            y: n.y ?? spiral.y,
          };
        }),
        edges: newEdges.map((e) => ({
          source: typeof e.source === "string" ? e.source : e.source.id,
          target: typeof e.target === "string" ? e.target : e.target.id,
          edgeType: e.edgeType,
          weight: e.weight,
        })),
        scalingRatio,
        gravity,
      });
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

  // Only structural edges participate in physics — tag edges are visual-only.
  // This prevents nodes from clustering just because they share tags, keeping
  // the layout driven by meaningful semantic relationships.
  const structuralEdges = edges.filter((e) => e.edgeType !== "tag");

  const forces = createGraphForces<GraphNode, GraphEdge>(
    structuralEdges,
    scalingRatio,
    gravity,
    profile,
  );

  // .stop() kills d3's internal timer — GraphCanvas's rAF loop drives ticking
  // through controller.tick(), which gates on SLEEP_ALPHA so a settled layout
  // costs nothing per frame.
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

  // Warm-up (main thread — blocks, so the adaptive tick count matters even
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
      // Sleep gate: skip force passes once settled, unless a drag is holding
      // alphaTarget above zero.
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
      // Keep the sim warm during the drag so neighbours react (and the
      // sleep gate in tick() stays open).
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

    updateData(newNodes: GraphNode[], newEdges: GraphEdge[]) {
      simulation.nodes(newNodes);
      forces.link.links(newEdges.filter((e) => e.edgeType !== "tag"));
      simulation.alpha(0.5);
    },

    stop() {
      simulation.stop();
    },
  };
}
