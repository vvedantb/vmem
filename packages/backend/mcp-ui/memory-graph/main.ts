import {
  App,
  applyDocumentTheme,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface MemoryNode {
  id: string;
  title: string;
  type?: "profile" | "episodic" | "knowledge";
  tags: string[];
  createdAt: string;
}

interface RelatesEdge {
  source: string;
  target: string;
  reason: string;
  score?: number;
}

interface TagEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphPayload {
  nodes: MemoryNode[];
  relatesToEdges: RelatesEdge[];
  tagEdges: TagEdge[];
  truncated: boolean;
  stats: {
    nodeCount: number;
    relatesToEdgeCount: number;
    tagEdgeCount: number;
    totalNodesBeforeCap: number;
  };
}

interface SimNode {
  id: string;
  title: string;
  type?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS_DARK: Record<string, string> = {
  profile: "#60a5fa",
  episodic: "#a78bfa",
  knowledge: "#34d399",
  default: "#94a3b8",
};

const TYPE_COLORS_LIGHT: Record<string, string> = {
  profile: "#2563eb",
  episodic: "#7c3aed",
  knowledge: "#059669",
  default: "#64748b",
};

let isDark = true;
let graphNodes: SimNode[] = [];
let relatesEdges: RelatesEdge[] = [];
let tagEdges: TagEdge[] = [];
let animationFrame = 0;

let panX = 0;
let panY = 0;
let zoom = 1;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;

const canvas = document.getElementById("graph-canvas");
const loadingEl = document.getElementById("loading");
const statsEl = document.getElementById("stats");
const hintEl = document.getElementById("hint");
const bannerEl = document.getElementById("banner");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("graph-canvas element missing");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

function applyTheme(theme: "light" | "dark") {
  isDark = theme === "dark";
  document.body.setAttribute("data-theme", theme);
}

function nodeColor(type: string | undefined): string {
  const palette = isDark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT;
  if (type && type in palette) return palette[type] ?? palette.default;
  return palette.default;
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  return {
    x: (sx - cx - panX) / zoom,
    y: (sy - cy - panY) / zoom,
  };
}

function buildSimulation(data: GraphPayload) {
  const count = data.nodes.length;
  const radius = Math.max(120, Math.sqrt(count) * 28);
  graphNodes = data.nodes.map((n, i) => {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2;
    return {
      id: n.id,
      title: n.title,
      type: n.type,
      x: Math.cos(angle) * radius * 0.35,
      y: Math.sin(angle) * radius * 0.35,
      vx: 0,
      vy: 0,
    };
  });
  relatesEdges = data.relatesToEdges;
  tagEdges = data.tagEdges;
}

function nodeById(): Map<string, SimNode> {
  return new Map(graphNodes.map((n) => [n.id, n]));
}

function simulateStep() {
  const nodes = graphNodes;
  const byId = nodeById();
  const repulsion = 420;
  const centerPull = 0.02;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1) {
        dist = 1;
        dx = (Math.random() - 0.5) * 0.01;
        dy = (Math.random() - 0.5) * 0.01;
      }
      const force = repulsion / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  const link = (
    source: string,
    target: string,
    strength: number,
    distance: number,
  ) => {
    const a = byId.get(source);
    const b = byId.get(target);
    if (!a || !b) return;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1) dist = 1;
    const displacement = (dist - distance) * strength;
    const fx = (dx / dist) * displacement;
    const fy = (dy / dist) * displacement;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  };

  for (const edge of relatesEdges) {
    link(edge.source, edge.target, 0.08, 90);
  }
  for (const edge of tagEdges) {
    link(edge.source, edge.target, 0.04, 120);
  }

  for (const n of nodes) {
    n.vx += -n.x * centerPull;
    n.vy += -n.y * centerPull;
    n.vx *= 0.85;
    n.vy *= 0.85;
    n.x += n.vx;
    n.y += n.vy;
  }
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + panX, h / 2 + panY);
  ctx.scale(zoom, zoom);

  ctx.lineWidth = 1;

  for (const edge of tagEdges) {
    const a = graphNodes.find((n) => n.id === edge.source);
    const b = graphNodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDark
      ? "rgba(148, 163, 184, 0.35)"
      : "rgba(100, 116, 139, 0.35)";
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const edge of relatesEdges) {
    const a = graphNodes.find((n) => n.id === edge.source);
    const b = graphNodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.strokeStyle = isDark
      ? "rgba(52, 211, 153, 0.55)"
      : "rgba(5, 150, 105, 0.5)";
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const n of graphNodes) {
    const r = 7;
    ctx.beginPath();
    ctx.fillStyle = nodeColor(n.type);
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (zoom >= 0.85) {
      const label = n.title.length > 28 ? `${n.title.slice(0, 28)}…` : n.title;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, n.x, n.y + r + 3);
    }
  }

  ctx.restore();
}

function fitToView() {
  if (graphNodes.length === 0) return;
  let minX = graphNodes[0].x;
  let maxX = graphNodes[0].x;
  let minY = graphNodes[0].y;
  let maxY = graphNodes[0].y;
  for (const n of graphNodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const rect = canvas.getBoundingClientRect();
  const padding = 48;
  const graphW = Math.max(maxX - minX, 40);
  const graphH = Math.max(maxY - minY, 40);
  const scaleX = (rect.width - padding * 2) / graphW;
  const scaleY = (rect.height - padding * 2) / graphH;
  zoom = Math.min(2.5, Math.max(0.2, Math.min(scaleX, scaleY)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  panX = -cx * zoom;
  panY = -cy * zoom;
}

function runSimulation() {
  for (let i = 0; i < 80; i++) simulateStep();
  fitToView();
  draw();
}

function startLoop() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  let ticks = 0;
  const tick = () => {
    if (ticks < 30) {
      simulateStep();
      draw();
      ticks += 1;
      animationFrame = requestAnimationFrame(tick);
    }
  };
  animationFrame = requestAnimationFrame(tick);
}

function isGraphPayload(value: object): value is GraphPayload {
  return (
    "nodes" in value &&
    Array.isArray(value.nodes) &&
    "relatesToEdges" in value &&
    Array.isArray(value.relatesToEdges) &&
    "tagEdges" in value &&
    Array.isArray(value.tagEdges)
  );
}

function renderGraph(data: GraphPayload) {
  buildSimulation(data);
  runSimulation();
  startLoop();

  statsEl.textContent = `${data.stats.nodeCount} memories · ${data.stats.relatesToEdgeCount} relates · ${data.stats.tagEdgeCount} tags`;
  hintEl.textContent = "Drag to pan · Scroll to zoom";

  if (data.truncated) {
    bannerEl.textContent = `Showing ${data.stats.nodeCount} of ${data.stats.totalNodesBeforeCap} memories (truncated for MCP). Use focus or memoryIds to narrow.`;
    bannerEl.classList.add("visible");
  } else {
    bannerEl.classList.remove("visible");
  }
}

function parseStructuredContent(result: CallToolResult): GraphPayload | null {
  const raw = result.structuredContent;
  if (raw === undefined || typeof raw !== "object" || raw === null) {
    return null;
  }
  if (!isGraphPayload(raw)) {
    return null;
  }
  return raw;
}

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    zoom = Math.min(4, Math.max(0.15, zoom * factor));
    const after = screenToWorld(mx, my);
    panX += (after.x - before.x) * zoom;
    panY += (after.y - before.y) * zoom;
    draw();
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (e) => {
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginX = panX;
  panOriginY = panY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!isPanning) return;
  panX = panOriginX + (e.clientX - panStartX);
  panY = panOriginY + (e.clientY - panStartY);
  draw();
});

canvas.addEventListener("pointerup", () => {
  isPanning = false;
  canvas.classList.remove("dragging");
});

canvas.addEventListener("pointercancel", () => {
  isPanning = false;
  canvas.classList.remove("dragging");
});

window.addEventListener("resize", resizeCanvas);

const app = new App({ name: "vmem Memory Graph", version: "1.0.0" });

app.ontoolinput = () => {
  loadingEl.classList.remove("hidden");
  statsEl.textContent = "Loading memory graph…";
};

app.ontoolresult = (result: CallToolResult) => {
  loadingEl.classList.add("hidden");
  if (result.isError) {
    statsEl.textContent = "Failed to load graph";
    return;
  }
  const data = parseStructuredContent(result);
  if (!data || data.nodes.length === 0) {
    statsEl.textContent = "No memories to display";
    return;
  }
  renderGraph(data);
};

app.ontoolcancelled = () => {
  loadingEl.classList.add("hidden");
  statsEl.textContent = "Cancelled";
};

function handleHostContext(hostCtx: McpUiHostContext) {
  if (hostCtx.theme) {
    applyDocumentTheme(hostCtx.theme);
    applyTheme(hostCtx.theme);
    draw();
  }
}

app.onhostcontextchanged = handleHostContext;

app.onteardown = async () => ({});

app.onerror = console.error;

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
applyTheme(prefersDark.matches ? "dark" : "light");
prefersDark.addEventListener("change", (e) => {
  applyTheme(e.matches ? "dark" : "light");
  draw();
});

app.connect().then(() => {
  const hostCtx = app.getHostContext();
  if (hostCtx) handleHostContext(hostCtx);
  resizeCanvas();
});
