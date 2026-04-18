/// <reference lib="webworker" />
/**
 * Web Worker for d3-force simulation.
 * Runs physics off the main thread, posts position updates at ~30fps.
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

// ------ Worker-internal node/edge types (lightweight, not shared with main thread) ------

interface WNode extends SimulationNodeDatum {
  id: string;
  size: number;
}

type WEdgeType = "tag" | "relates_to" | "imports" | "wiki_parent";

interface WEdge extends SimulationLinkDatum<WNode> {
  edgeType: WEdgeType;
  weight: number;
}

// ------ State ------

let sim: Simulation<WNode, WEdge> | null = null;
let nodes: WNode[] = [];
let nodeById = new Map<string, WNode>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let draggedId: string | null = null;

// Keep direct references to forces to avoid `as` casts when updating params
let chargeForceRef: ReturnType<typeof forceManyBody<WNode>> | null = null;
let centerForceRef: ReturnType<typeof forceCenter<WNode>> | null = null;

// ------ Message handler ------

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case "init":
      init(msg.nodes, msg.edges, msg.scalingRatio, msg.gravity);
      break;

    case "reheat":
      sim?.alpha(0.5).restart();
      break;

    case "setStrength": {
      if (chargeForceRef) {
        chargeForceRef.strength(-msg.scalingRatio * 8);
        sim?.alpha(0.3).restart();
      }
      break;
    }

    case "setGravity": {
      if (centerForceRef) {
        centerForceRef.strength(msg.gravity * 3.0);
        sim?.alpha(0.3).restart();
      }
      break;
    }

    case "dragStart": {
      const node = nodeById.get(msg.nodeId);
      if (node) {
        node.fx = msg.x;
        node.fy = msg.y;
        draggedId = msg.nodeId;
      }
      break;
    }

    case "dragMove": {
      if (draggedId) {
        const node = nodeById.get(draggedId);
        if (node) {
          node.fx = msg.x;
          node.fy = msg.y;
        }
      }
      break;
    }

    case "dragEnd": {
      const node = nodeById.get(msg.nodeId);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      draggedId = null;
      break;
    }

    case "stop":
      cleanup();
      break;
  }
};

// ------ Simulation setup ------

function init(
  initNodes: Array<{ id: string; size: number; x: number; y: number }>,
  initEdges: Array<{
    source: string;
    target: string;
    edgeType: WEdgeType;
    weight: number;
  }>,
  scalingRatio: number,
  gravity: number,
): void {
  cleanup();

  nodes = initNodes.map((n) => ({
    id: n.id,
    size: n.size,
    x: n.x,
    y: n.y,
  }));

  nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edges: WEdge[] = initEdges.map((e) => ({
    source: e.source,
    target: e.target,
    edgeType: e.edgeType,
    weight: e.weight,
  }));

  const chargeStrength = -scalingRatio * 8;
  const theta = nodes.length > 10_000 ? 1.5 : 0.9;

  // Obsidian-style springs: short distance + strong pull so connected nodes
  // visibly cluster. Tag edges (derived from shared tags) pull less hard than
  // explicit user-created relates_to links.
  const linkForce = forceLink<WNode, WEdge>(edges)
    .id((d) => d.id)
    .distance(35)
    .strength((d) =>
      d.edgeType === "relates_to" ||
      d.edgeType === "imports" ||
      d.edgeType === "wiki_parent"
        ? 1.0
        : 0.4,
    );

  chargeForceRef = forceManyBody<WNode>().strength(chargeStrength).theta(theta);

  // Stronger center pull keeps the whole graph bounded in the viewport,
  // preventing isolated nodes from drifting off-screen.
  centerForceRef = forceCenter<WNode>(0, 0).strength(gravity * 3.0);

  const collideForce = forceCollide<WNode>()
    .radius((d) => d.size * 2 + 1)
    .strength(0.9);

  // alphaDecay 0.0228 = d3 default; velocityDecay 0.4 = smoother organic motion.
  sim = forceSimulation<WNode, WEdge>(nodes)
    .force("link", linkForce)
    .force("charge", chargeForceRef)
    .force("center", centerForceRef)
    .force("collide", collideForce)
    .alphaDecay(0.0228)
    .velocityDecay(0.4)
    .alpha(1);

  // Warm-up ticks run here in the worker (non-blocking for main thread)
  for (let i = 0; i < 150; i++) {
    sim.tick();
  }
  sim.alpha(0.2).restart();

  // Post initial positions immediately after warm-up
  postPositions();

  // Start periodic position updates at ~30fps
  tickTimer = setInterval(() => {
    if (!sim) return;
    sim.tick();
    postPositions();
  }, 33);
}

// ------ Position transfer ------

function postPositions(): void {
  if (!sim) return;

  const buffer = new Float64Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    buffer[i * 2] = nodes[i].x ?? 0;
    buffer[i * 2 + 1] = nodes[i].y ?? 0;
  }

  const alpha = sim.alpha();

  // Transfer the buffer (zero-copy) rather than copying
  self.postMessage(
    { type: "positions", buffer, alpha },
    {
      transfer: [buffer.buffer],
    },
  );
}

// ------ Cleanup ------

function cleanup(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (sim) {
    sim.stop();
    sim = null;
  }
  nodes = [];
  nodeById.clear();
  draggedId = null;
}
