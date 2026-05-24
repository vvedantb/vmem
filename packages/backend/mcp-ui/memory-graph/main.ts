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
  tags: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Canvas palette — mirrors apps/web graph-view-themes DEFAULT dark/light. */
interface GraphCanvasTheme {
  background: string;
  gradientCenter: string | null;
  edgeTag: string;
  edgeRelates: string;
  label: string;
  glowIntensity: number;
  nodeFallback: string;
}

const CANVAS_THEME_DARK: GraphCanvasTheme = {
  background: "#111111",
  gradientCenter: null,
  edgeTag: "rgba(180,180,200,0.18)",
  edgeRelates: "rgba(255,170,110,0.55)",
  label: "rgba(255,255,255,0.9)",
  glowIntensity: 0.15,
  nodeFallback: "#555566",
};

const CANVAS_THEME_LIGHT: GraphCanvasTheme = {
  background: "#ffffff",
  gradientCenter: "rgba(80, 80, 180, 0.03)",
  edgeTag: "rgba(60,70,90,0.22)",
  edgeRelates: "rgba(200,90,30,0.65)",
  label: "rgba(0,0,0,0.88)",
  glowIntensity: 0.12,
  nodeFallback: "#999999",
};

let isDark = true;
let canvasTheme: GraphCanvasTheme = CANVAS_THEME_DARK;
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
const legendStatsEl = document.getElementById("legend-stats");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnFit = document.getElementById("btn-fit");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("graph-canvas element missing");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

/** Same hue hash as apps/web graph-colors.ts */
function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function tagToColor(tag: string, dark: boolean): string {
  const hue = tagToHue(tag);
  return dark ? hslToHex(hue, 50, 72) : hslToHex(hue, 55, 48);
}

function nodeColor(tags: string[]): string {
  if (tags.length > 0) return tagToColor(tags[0], isDark);
  return canvasTheme.nodeFallback;
}

function applyTheme(theme: "light" | "dark") {
  isDark = theme === "dark";
  canvasTheme = isDark ? CANVAS_THEME_DARK : CANVAS_THEME_LIGHT;
  document.body.setAttribute("data-theme", theme);
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
  const radius = Math.max(200, Math.sqrt(count) * 42);
  graphNodes = data.nodes.map((n, i) => {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2;
    return {
      id: n.id,
      title: n.title,
      tags: n.tags,
      x: Math.cos(angle) * radius * 0.55,
      y: Math.sin(angle) * radius * 0.55,
      vx: 0,
      vy: 0,
    };
  });
  relatesEdges = data.relatesToEdges;
  tagEdges = data.tagEdges;
}

function simulationParams(nodeCount: number) {
  return {
    repulsion: Math.min(1600, 650 + nodeCount * 10),
    relatesDistance: 130,
    tagDistance: 170,
    centerPull: 0.008,
  };
}

function nodeById(): Map<string, SimNode> {
  return new Map(graphNodes.map((n) => [n.id, n]));
}

function simulateStep() {
  const nodes = graphNodes;
  const byId = nodeById();
  const { repulsion, relatesDistance, tagDistance, centerPull } =
    simulationParams(nodes.length);

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
    link(edge.source, edge.target, 0.06, relatesDistance);
  }
  for (const edge of tagEdges) {
    link(edge.source, edge.target, 0.03, tagDistance);
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

function paintCanvasBackground(w: number, h: number) {
  ctx.fillStyle = canvasTheme.background;
  ctx.fillRect(0, 0, w, h);
  if (canvasTheme.gradientCenter) {
    const g = ctx.createRadialGradient(
      w * 0.5,
      h * 0.35,
      0,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.65,
    );
    g.addColorStop(0, canvasTheme.gradientCenter);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

const NODE_RADIUS = 5;
const LABEL_FONT_PX = 9;
const LABEL_MAX_WIDTH = 72;

function truncateLabel(title: string, maxWidth: number): string {
  if (ctx.measureText(title).width <= maxWidth) return title;
  const ellipsis = "…";
  let end = title.length;
  while (end > 0) {
    const candidate = `${title.slice(0, end)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    end -= 1;
  }
  return ellipsis;
}

function drawNodeLabels() {
  if (zoom < 0.45) return;

  ctx.font = `${LABEL_FONT_PX}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = canvasTheme.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const n of graphNodes) {
    const label = truncateLabel(n.title, LABEL_MAX_WIDTH);
    ctx.fillText(label, n.x, n.y + NODE_RADIUS + 3);
  }
}

function drawNodeGlow(n: SimNode, color: string, r: number) {
  const glowR = r * 2.5;
  const alpha = Math.round(canvasTheme.glowIntensity * 255)
    .toString(16)
    .padStart(2, "0");
  const grad = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, glowR);
  grad.addColorStop(0, `${color}${alpha}`);
  grad.addColorStop(1, `${color}00`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  ctx.save();
  paintCanvasBackground(w, h);
  ctx.translate(w / 2 + panX, h / 2 + panY);
  ctx.scale(zoom, zoom);

  ctx.lineWidth = 0.8;

  for (const edge of tagEdges) {
    const a = graphNodes.find((n) => n.id === edge.source);
    const b = graphNodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.strokeStyle = canvasTheme.edgeTag;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const edge of relatesEdges) {
    const a = graphNodes.find((n) => n.id === edge.source);
    const b = graphNodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = canvasTheme.edgeRelates;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.lineWidth = 0.8;
  }

  const showGlow = graphNodes.length <= 120 && zoom >= 0.5;
  if (showGlow) {
    for (const n of graphNodes) {
      drawNodeGlow(n, nodeColor(n.tags), NODE_RADIUS);
    }
  }

  for (const n of graphNodes) {
    const color = nodeColor(n.tags);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  drawNodeLabels();

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
  const padding = 64;
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

function zoomBy(factor: number) {
  const rect = canvas.getBoundingClientRect();
  const mx = rect.width / 2;
  const my = rect.height / 2;
  const before = screenToWorld(mx, my);
  zoom = Math.min(4, Math.max(0.15, zoom * factor));
  const after = screenToWorld(mx, my);
  panX += (after.x - before.x) * zoom;
  panY += (after.y - before.y) * zoom;
  draw();
}

function runSimulation() {
  for (let i = 0; i < 140; i++) simulateStep();
  fitToView();
  draw();
}

function startLoop() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  let ticks = 0;
  const tick = () => {
    if (ticks < 50) {
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

function formatCount(n: number): string {
  return n.toLocaleString();
}

function renderGraph(data: GraphPayload) {
  buildSimulation(data);
  runSimulation();
  startLoop();

  const edgeTotal = data.stats.relatesToEdgeCount + data.stats.tagEdgeCount;
  statsEl.textContent = `${formatCount(data.stats.nodeCount)} memories · ${formatCount(edgeTotal)} edges`;
  if (legendStatsEl) {
    legendStatsEl.textContent = `${formatCount(data.stats.nodeCount)} nodes · ${formatCount(data.stats.relatesToEdgeCount)} relates · ${formatCount(data.stats.tagEdgeCount)} tags`;
  }
  hintEl.textContent = "Drag to pan · Scroll to zoom";

  if (data.truncated) {
    bannerEl.textContent = `Showing ${formatCount(data.stats.nodeCount)} of ${formatCount(data.stats.totalNodesBeforeCap)} memories. Use focus or memoryIds to narrow.`;
    bannerEl.classList.add("visible");
  } else {
    bannerEl.classList.remove("visible");
  }

  requestTallViewport();
  resizeCanvas();
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

if (btnZoomIn instanceof HTMLButtonElement) {
  btnZoomIn.addEventListener("click", () => zoomBy(1.2));
}
if (btnZoomOut instanceof HTMLButtonElement) {
  btnZoomOut.addEventListener("click", () => zoomBy(1 / 1.2));
}
if (btnFit instanceof HTMLButtonElement) {
  btnFit.addEventListener("click", () => {
    fitToView();
    draw();
  });
}

window.addEventListener("resize", resizeCanvas);

const app = new App({ name: "vmem Memory Graph", version: "1.0.0" });

app.ontoolinput = () => {
  loadingEl.classList.remove("hidden");
  statsEl.textContent = "Loading…";
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

const PREFERRED_VIEWPORT_HEIGHT_PX = 560;

function requestTallViewport() {
  const width = Math.max(280, Math.round(window.innerWidth));
  void app.sendSizeChanged({
    width,
    height: PREFERRED_VIEWPORT_HEIGHT_PX,
  });
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
applyTheme(prefersDark.matches ? "dark" : "light");
prefersDark.addEventListener("change", (e) => {
  applyTheme(e.matches ? "dark" : "light");
  draw();
});

app.connect().then(() => {
  const hostCtx = app.getHostContext();
  if (hostCtx) handleHostContext(hostCtx);
  requestTallViewport();
  resizeCanvas();
});
