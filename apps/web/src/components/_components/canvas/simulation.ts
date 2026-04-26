/**
 * Simulation controller — wraps d3-force in a Web Worker for off-main-thread physics.
 * Falls back to main-thread simulation if Worker creation fails.
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { GraphNode, GraphEdge } from "./types";

type WorkerPositionMessage = {
  type: "positions";
  buffer: Float64Array;
  alpha: number;
};

export interface SimulationController {
  /** Current simulation alpha (convergence indicator, 0 = stable) */
  alpha: () => number;
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

  const worker = new Worker(new URL("./simulation-worker.ts", import.meta.url));

  let currentAlpha = 1;

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
      for (let i = 0; i < nodes.length; i++) {
        // Don't overwrite position of a node being dragged (main thread has authority)
        if (nodes[i].fx !== undefined && nodes[i].fx !== null) continue;
        nodes[i].x = buffer[i * 2];
        nodes[i].y = buffer[i * 2 + 1];
      }
    }
  };

  return {
    alpha: () => currentAlpha,

    // No-op: worker handles its own ticking
    tick: () => {},

    reheat: () => worker.postMessage({ type: "reheat" }),

    setStrength: (s: number) =>
      worker.postMessage({ type: "setStrength", scalingRatio: s }),

    setGravity: (g: number) =>
      worker.postMessage({ type: "setGravity", gravity: g }),

    dragStart: (nodeId: string, x: number, y: number) => {
      // Set on main thread for immediate visual feedback
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      worker.postMessage({ type: "dragStart", nodeId, x, y });
    },

    dragMove: (nodeId: string, x: number, y: number) => {
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
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      worker.postMessage({ type: "dragEnd", nodeId });
    },

    updateData: (newNodes: GraphNode[], newEdges: GraphEdge[]) => {
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

    stop: () => worker.terminate(),
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

  const chargeStrength = -scalingRatio * 8;
  const theta = nodes.length > 10_000 ? 1.5 : 0.9;

  // Only structural edges participate in physics — tag edges are visual-only.
  // This prevents nodes from clustering just because they share tags, keeping
  // the layout driven by meaningful semantic relationships.
  const structuralEdges = edges.filter((e) => e.edgeType !== "tag");

  const linkForce = forceLink<GraphNode, GraphEdge>(structuralEdges)
    .id((d) => d.id)
    .distance(70)
    .strength(0.6);

  const chargeForce = forceManyBody<GraphNode>()
    .strength(chargeStrength)
    .theta(theta);

  const centerForce = forceCenter<GraphNode>(0, 0).strength(gravity * 2.0);

  // Hard non-overlap: radius matches the rendered node (size*2) plus a pad,
  // strength 1 + 3 iterations so the force fully resolves even in dense
  // clusters where many constraints compete each tick.
  const collideForce = forceCollide<GraphNode>()
    .radius((d) => d.size * 2 + 8)
    .strength(1)
    .iterations(3);

  const simulation = forceSimulation<GraphNode, GraphEdge>(nodes)
    .force("link", linkForce)
    .force("charge", chargeForce)
    .force("center", centerForce)
    .force("collide", collideForce)
    .alphaDecay(0.03)
    .velocityDecay(0.5);

  // Warm-up (main thread — blocks but same as original behavior)
  for (let i = 0; i < 150; i++) {
    simulation.tick();
  }
  simulation.alpha(0.2).restart();

  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  return {
    alpha: () => simulation.alpha(),

    tick() {
      simulation.tick();
    },

    reheat() {
      const current = simulation.alpha();
      simulation.alpha(Math.max(current, 0.1)).restart();
    },

    setStrength(s: number) {
      chargeForce.strength(-s * 8);
      simulation.alpha(0.3).restart();
    },

    setGravity(g: number) {
      centerForce.strength(g * 2.0);
      simulation.alpha(0.3).restart();
    },

    dragStart(nodeId: string, x: number, y: number) {
      const node = nodeById.get(nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
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
    },

    updateData(newNodes: GraphNode[], newEdges: GraphEdge[]) {
      simulation.nodes(newNodes);
      linkForce.links(newEdges);
      simulation.alpha(0.5).restart();
    },

    stop() {
      simulation.stop();
    },
  };
}
