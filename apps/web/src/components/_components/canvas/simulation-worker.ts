/// <reference lib="webworker" />
// web Worker for d3-force simulation
import {
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphEdgeType } from "./types";
import { physicsProfile } from "./physics-profile";
import {
  createGraphForces,
  VELOCITY_DECAY,
  type GraphForces,
} from "./physics-forces";

// ------ Worker-internal node/edge types (lightweight, not shared with main thread) ------

interface WNode extends SimulationNodeDatum {
  id: string;
  size: number;
}

interface WEdge extends SimulationLinkDatum<WNode> {
  edgeType: GraphEdgeType;
  weight: number;
}

// ------ State ------

// below this alpha (with no drag holding alphaTarget up) the layout is visually static,
const SLEEP_ALPHA = 0.005;
// tick cadence comes from the node-count-adaptive physics profile (see physics-profile.ts)
let tickIntervalMs = 33;
let ticksPerFrame = 2;

let sim: Simulation<WNode, WEdge> | null = null;
let nodes: WNode[] = [];
let nodeById = new Map<string, WNode>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let draggedId: string | null = null;

// force bundle (shared Obsidian-style model — see physics-forces.ts); kept
// for settings-slider updates without `as` casts
let forcesRef: GraphForces<WNode, WEdge> | null = null;

// ------ Worker message protocol (must match simulation.ts postMessage calls) ------

type WorkerInputMessage =
  | {
      type: "init";
      nodes: Array<{ id: string; size: number; x: number; y: number }>;
      edges: Array<{
        source: string;
        target: string;
        edgeType: GraphEdgeType;
        weight: number;
      }>;
      scalingRatio: number;
      gravity: number;
    }
  | { type: "reheat" }
  | { type: "setStrength"; scalingRatio: number }
  | { type: "setGravity"; gravity: number }
  | { type: "dragStart"; nodeId: string; x: number; y: number }
  | { type: "dragMove"; x: number; y: number }
  | { type: "dragEnd"; nodeId: string };

// ------ Message handler ------

self.onmessage = (e: MessageEvent<WorkerInputMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "init":
      init(msg.nodes, msg.edges, msg.scalingRatio, msg.gravity);
      break;

    case "reheat": {
      // don't clobber a hotter simulation. Drag-release only needs a nudge
      const current = sim?.alpha() ?? 0;
      sim?.alpha(Math.max(current, 0.1));
      ensureTicking();
      break;
    }

    case "setStrength": {
      if (forcesRef) {
        forcesRef.setStrength(msg.scalingRatio);
        sim?.alpha(0.3);
        ensureTicking();
      }
      break;
    }

    case "setGravity": {
      if (forcesRef) {
        forcesRef.setGravity(msg.gravity);
        sim?.alpha(0.3);
        ensureTicking();
      }
      break;
    }

    case "dragStart": {
      const node = nodeById.get(msg.nodeId);
      if (node) {
        node.fx = msg.x;
        node.fy = msg.y;
        draggedId = msg.nodeId;
        // canonical d3 drag pattern
        sim?.alphaTarget(0.3);
        ensureTicking();
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
      // release the drag's alphaTarget so the sim can settle and sleep again
      sim?.alphaTarget(0);
      break;
    }
  }
};

// ------ Simulation setup ------

function init(
  initNodes: Array<{ id: string; size: number; x: number; y: number }>,
  initEdges: Array<{
    source: string;
    target: string;
    edgeType: GraphEdgeType;
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

  const profile = physicsProfile(nodes.length);
  tickIntervalMs = profile.tickIntervalMs;
  ticksPerFrame = profile.ticksPerFrame;

  // only structural edges participate in physics — tag edges are visual-only
  const structuralEdges = edges.filter((e) => e.edgeType !== "tag");

  const forces = createGraphForces<WNode, WEdge>(
    structuralEdges,
    scalingRatio,
    gravity,
    profile,
  );
  forcesRef = forces;

  // .stop() kills d3's internal timer
  sim = forceSimulation<WNode, WEdge>(nodes)
    .force("link", forces.link)
    .force("charge", forces.charge)
    .force("centerX", forces.centerX)
    .force("centerY", forces.centerY)
    .alphaDecay(profile.alphaDecay)
    .velocityDecay(VELOCITY_DECAY)
    .alpha(1)
    .stop();

  if (forces.collide) {
    sim.force("collide", forces.collide);
  }

  // post the seeded (spiral / carried-over) positions immediately so the canvas paints
  postPositions();

  // warm-up ticks run here in the worker (non-blocking for main thread),
  // scaled down for large graphs where each tick is expensive
  for (let i = 0; i < profile.warmupTicks; i++) {
    sim.tick();
  }
  sim.alpha(0.2);

  // post initial positions immediately after warm-up
  postPositions();

  ensureTicking();
}

// starts the periodic tick+post loop if it isn't already running, and stops it again
function ensureTicking(): void {
  if (tickTimer !== null || !sim) return;
  tickTimer = setInterval(() => {
    if (!sim) return;
    for (let i = 0; i < ticksPerFrame; i++) {
      sim.tick();
    }
    postPositions();
    if (sim.alpha() < SLEEP_ALPHA && sim.alphaTarget() === 0) {
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    }
  }, tickIntervalMs);
}

// ------ Position transfer ------

function postPositions(): void {
  if (!sim) return;

  // float32 halves the per-frame transfer (1.6 MB → 0.8 MB at 100k nodes);
  // sub-pixel precision loss is irrelevant for canvas drawing
  const buffer = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    buffer[i * 2] = node.x ?? 0;
    buffer[i * 2 + 1] = node.y ?? 0;
  }

  const alpha = sim.alpha();

  // transfer the buffer (zero-copy) rather than copying
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
  forcesRef = null;
}
