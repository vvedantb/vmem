/// <reference lib="webworker" />
/**
 * Web Worker for d3-force simulation.
 * Runs physics off the main thread, posts position updates at ~30fps while
 * the layout is moving, then sleeps entirely (no interval, zero CPU) once it
 * settles. Reheat/drag/settings messages wake it back up.
 */
import {
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
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

type WEdgeType = "tag" | "relates_to" | "imports" | "wiki_parent" | "mentions";

interface WEdge extends SimulationLinkDatum<WNode> {
  edgeType: WEdgeType;
  weight: number;
}

// ------ State ------

// Below this alpha (with no drag holding alphaTarget up) the layout is
// visually static, so we stop the tick interval entirely — zero CPU while
// idle. Any wake signal (reheat, drag, settings change) calls ensureTicking.
const SLEEP_ALPHA = 0.005;
// Tick cadence comes from the node-count-adaptive physics profile (see
// physics-profile.ts). Multiple physics ticks per posted frame keep the
// settle animation's pace while reducing position-message traffic.
let tickIntervalMs = 33;
let ticksPerFrame = 2;

let sim: Simulation<WNode, WEdge> | null = null;
let nodes: WNode[] = [];
let nodeById = new Map<string, WNode>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let draggedId: string | null = null;

// Force bundle (shared Obsidian-style model — see physics-forces.ts); kept
// for settings-slider updates without `as` casts.
let forcesRef: GraphForces<WNode, WEdge> | null = null;

// ------ Message handler ------

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case "init":
      init(msg.nodes, msg.edges, msg.scalingRatio, msg.gravity);
      break;

    case "reheat": {
      // Don't clobber a hotter simulation. Drag-release only needs a nudge.
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
        // Canonical d3 drag pattern: a non-zero alphaTarget keeps the sim
        // warm for the whole drag so neighbours react to the moving node.
        // It also blocks the sleep check (which requires alphaTarget 0).
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
      // Release the drag's alphaTarget so the sim can settle and sleep again.
      sim?.alphaTarget(0);
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

  const profile = physicsProfile(nodes.length);
  tickIntervalMs = profile.tickIntervalMs;
  ticksPerFrame = profile.ticksPerFrame;

  // Only structural edges participate in physics — tag edges are visual-only.
  // This prevents nodes from clustering just because they share tags, keeping
  // the layout driven by meaningful semantic relationships.
  const structuralEdges = edges.filter((e) => e.edgeType !== "tag");

  const forces = createGraphForces<WNode, WEdge>(
    structuralEdges,
    scalingRatio,
    gravity,
    profile,
  );
  forcesRef = forces;

  // .stop() kills d3's internal timer — ticking is fully manual via
  // ensureTicking's interval, so the sleep check below is the single
  // authority on whether physics runs.
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

  // Post the seeded (spiral / carried-over) positions immediately so the
  // canvas paints right away — at 100k nodes warm-up takes seconds, and the
  // layout visibly morphing beats a frozen screen.
  postPositions();

  // Warm-up ticks run here in the worker (non-blocking for main thread),
  // scaled down for large graphs where each tick is expensive.
  for (let i = 0; i < profile.warmupTicks; i++) {
    sim.tick();
  }
  sim.alpha(0.2);

  // Post initial positions immediately after warm-up
  postPositions();

  ensureTicking();
}

/**
 * Starts the periodic tick+post loop if it isn't already running, and stops
 * it again once the simulation has settled (alpha below SLEEP_ALPHA with no
 * drag pinning alphaTarget up). Idempotent — every wake path calls this.
 */
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

  // Float32 halves the per-frame transfer (1.6 MB → 0.8 MB at 100k nodes);
  // sub-pixel precision loss is irrelevant for canvas drawing.
  const buffer = new Float32Array(nodes.length * 2);
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
  forcesRef = null;
}
