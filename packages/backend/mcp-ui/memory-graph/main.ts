import {
  App,
  applyDocumentTheme,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Graph } from "@cosmos.gl/graph";

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

type Rgba = [number, number, number, number];

interface GraphTheme {
  background: Rgba;
  edgeTag: Rgba;
  edgeRelates: Rgba;
  label: string;
  nodeFallback: Rgba;
  dimAlpha: number;
}

const SPACE_SIZE = 4096;
const POINT_SIZE = 8;
const MAX_LABELS = 48;
const ZOOM_IN_FACTOR = 1.3;
const ZOOM_OUT_FACTOR = 0.7;
const INITIAL_SETTLE_ALPHA = 0.08;
const DRAG_REHEAT_ALPHA = 0.25;
const LABEL_FONT =
  '500 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const THEME_DARK: GraphTheme = {
  background: [0.067, 0.067, 0.067, 1],
  edgeTag: [0.706, 0.706, 0.784, 0.18],
  edgeRelates: [1, 0.667, 0.431, 0.55],
  label: "rgba(255,255,255,0.9)",
  nodeFallback: [0.333, 0.333, 0.4, 1],
  dimAlpha: 0.15,
};

const THEME_LIGHT: GraphTheme = {
  background: [1, 1, 1, 1],
  edgeTag: [0.235, 0.275, 0.353, 0.22],
  edgeRelates: [0.784, 0.353, 0.118, 0.65],
  label: "rgba(0,0,0,0.88)",
  nodeFallback: [0.6, 0.6, 0.6, 1],
  dimAlpha: 0.2,
};

interface GraphBuffers {
  titles: string[];
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  links: Float32Array;
  linkColors: Float32Array;
  linkWidths: Float32Array;
  linkStrengths: Float32Array;
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} element missing`);
  return el;
}

function requireCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`#${id} canvas missing`);
  }
  return el;
}

function requireDiv(id: string): HTMLDivElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDivElement)) {
    throw new Error(`#${id} div missing`);
  }
  return el;
}

const host = requireDiv("graph-host");
const labelCanvas = requireCanvas("label-canvas");
const loadingEl = requireElement("loading");
const statsEl = requireElement("stats");
const hintEl = requireElement("hint");
const bannerEl = requireElement("banner");
const legendStatsEl = document.getElementById("legend-stats");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnFit = document.getElementById("btn-fit");
const webglErrorEl = document.getElementById("webgl-error");

let isDark = true;
let theme: GraphTheme = THEME_DARK;
let graph: Graph | null = null;
let buffers: GraphBuffers | null = null;

function tagToHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function hslToRgba(h: number, s: number, l: number): Rgba {
  const sat = s / 100;
  const lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const c = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.min(1, Math.max(0, c));
  };
  return [f(0), f(8), f(4), 1];
}

function tagToColor(tag: string, dark: boolean): Rgba {
  const hue = tagToHue(tag);
  return dark ? hslToRgba(hue, 50, 72) : hslToRgba(hue, 55, 48);
}

function nodeColor(tags: string[], dark: boolean, fallback: Rgba): Rgba {
  const first = tags[0];
  if (first !== undefined) return tagToColor(first, dark);
  return fallback;
}

function writeRgba(target: Float32Array, offset: number, rgba: Rgba): void {
  target[offset] = rgba[0];
  target[offset + 1] = rgba[1];
  target[offset + 2] = rgba[2];
  target[offset + 3] = rgba[3];
}

function seedPosition(index: number, count: number): { x: number; y: number } {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const radius = Math.max(200, Math.sqrt(count) * 42) * 0.55;
  const cx = SPACE_SIZE / 2;
  const cy = SPACE_SIZE / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function buildBuffers(data: GraphPayload, current: GraphTheme): GraphBuffers {
  const count = data.nodes.length;
  const titles: string[] = [];
  const positions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 4);
  const sizes = new Float32Array(count);
  const idToIndex = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    const node = data.nodes[i];
    if (node === undefined) continue;
    idToIndex.set(node.id, i);
    titles.push(node.title);
    const pos = seedPosition(i, count);
    positions[i * 2] = pos.x;
    positions[i * 2 + 1] = pos.y;
    writeRgba(
      colors,
      i * 4,
      nodeColor(node.tags, isDark, current.nodeFallback),
    );
    sizes[i] = POINT_SIZE;
  }

  const edgeCount = data.relatesToEdges.length + data.tagEdges.length;
  const links = new Float32Array(edgeCount * 2);
  const linkColors = new Float32Array(edgeCount * 4);
  const linkWidths = new Float32Array(edgeCount);
  const linkStrengths = new Float32Array(edgeCount);

  let linkIndex = 0;
  const pushEdge = (
    sourceId: string,
    targetId: string,
    color: Rgba,
    width: number,
    strength: number,
  ): void => {
    const source = idToIndex.get(sourceId);
    const target = idToIndex.get(targetId);
    if (source === undefined || target === undefined) return;
    links[linkIndex * 2] = source;
    links[linkIndex * 2 + 1] = target;
    writeRgba(linkColors, linkIndex * 4, color);
    linkWidths[linkIndex] = width;
    linkStrengths[linkIndex] = strength;
    linkIndex += 1;
  };

  for (const edge of data.tagEdges) {
    pushEdge(edge.source, edge.target, current.edgeTag, 0.8, 0);
  }
  for (const edge of data.relatesToEdges) {
    pushEdge(edge.source, edge.target, current.edgeRelates, 1.6, 1);
  }

  return {
    titles,
    positions,
    colors,
    sizes,
    links: links.subarray(0, linkIndex * 2),
    linkColors: linkColors.subarray(0, linkIndex * 4),
    linkWidths: linkWidths.subarray(0, linkIndex),
    linkStrengths: linkStrengths.subarray(0, linkIndex),
  };
}

function physicsForCount(nodeCount: number) {
  const simulationRepulsion =
    nodeCount <= 10
      ? 0.18
      : nodeCount <= 50
        ? 0.32
        : nodeCount <= 200
          ? 0.55
          : 1;
  return {
    simulationRepulsion,
    simulationGravity: 0.12,
    simulationCenter: 0.05,
    simulationFriction: 0.35,
    simulationDecay: nodeCount <= 2000 ? 400 : 700,
    simulationRepulsionTheta: 0.9,
    simulationRepulsionFromMouse: 0,
    simulationLinkSpring: 1,
    simulationLinkDistance:
      nodeCount <= 10 ? 3 : nodeCount <= 50 ? 5 : nodeCount <= 200 ? 7 : 10,
    simulationCollision: 1,
    simulationCollisionPadding: 0.35,
  };
}

function truncateLabel(title: string, maxChars = 28): string {
  if (title.length <= maxChars) return title;
  return `${title.slice(0, Math.max(0, maxChars - 1))}…`;
}

function paintLabels(g: Graph): void {
  const current = buffers;
  if (!current) return;

  const wrap = host.parentElement;
  if (!wrap) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w === 0 || h === 0) return;

  if (
    labelCanvas.width !== Math.floor(w * dpr) ||
    labelCanvas.height !== Math.floor(h * dpr)
  ) {
    labelCanvas.width = Math.floor(w * dpr);
    labelCanvas.height = Math.floor(h * dpr);
    labelCanvas.style.width = `${w}px`;
    labelCanvas.style.height = `${h}px`;
  }

  const ctx = labelCanvas.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const zoom = g.getZoomLevel();
  if (zoom < 0.45 || current.titles.length > 5000) return;

  ctx.font = LABEL_FONT;
  ctx.fillStyle = theme.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const { indices, positions } = g.getSampledPoints();
  let painted = 0;
  for (let i = 0; i < indices.length; i++) {
    if (painted >= MAX_LABELS) break;
    const idx = indices[i];
    if (idx === undefined) continue;
    const title = current.titles[idx];
    if (title === undefined) continue;
    const sx = positions[i * 2];
    const sy = positions[i * 2 + 1];
    if (sx === undefined || sy === undefined) continue;
    const [screenX, screenY] = g.spaceToScreenPosition([sx, sy]);
    ctx.fillText(truncateLabel(title), screenX, screenY + 8);
    painted += 1;
  }
}

function destroyGraph(): void {
  if (graph === null) return;
  graph.destroy();
  graph = null;
  buffers = null;
}

function showWebglError(message: string): void {
  statsEl.textContent = message;
  if (webglErrorEl) {
    webglErrorEl.textContent = message;
    webglErrorEl.classList.add("visible");
  }
}

function hideWebglError(): void {
  if (webglErrorEl) {
    webglErrorEl.classList.remove("visible");
    webglErrorEl.textContent = "";
  }
}

function createGraph(data: GraphPayload): void {
  destroyGraph();
  hideWebglError();

  const nextBuffers = buildBuffers(data, theme);
  buffers = nextBuffers;
  const physics = physicsForCount(data.nodes.length);

  try {
    const next = new Graph(host, {
      backgroundColor: theme.background,
      spaceSize: SPACE_SIZE,
      enableSimulation: true,
      enableDrag: true,
      enableZoom: true,
      fitViewOnInit: true,
      fitViewDelay: 100,
      fitViewPadding: data.nodes.length <= 50 ? 0.25 : 0.12,
      renderHoveredPointRing: true,
      hoveredPointCursor: "pointer",
      pointGreyoutOpacity: theme.dimAlpha,
      linkGreyoutOpacity: theme.dimAlpha,
      pointSamplingDistance: 80,
      ...physics,
      attribution: "",
      onZoom: () => {
        if (graph) paintLabels(graph);
      },
      onDragStart: () => {
        if (!graph) return;
        graph.unpause();
        graph.start(DRAG_REHEAT_ALPHA);
      },
      onSimulationTick: () => {
        if (graph) paintLabels(graph);
      },
    });

    next.setPointPositions(nextBuffers.positions);
    next.setPointColors(nextBuffers.colors);
    next.setPointSizes(nextBuffers.sizes);
    next.setLinks(nextBuffers.links);
    next.setLinkColors(nextBuffers.linkColors);
    next.setLinkWidths(nextBuffers.linkWidths);
    next.setLinkStrength(nextBuffers.linkStrengths);
    next.render();
    next.start(INITIAL_SETTLE_ALPHA);
    graph = next;
    paintLabels(next);
  } catch (err) {
    console.error("[vmem] cosmos WebGL init failed:", err);
    showWebglError("WebGL 2 is required to display the graph");
  }
}

function recolorFromPayload(data: GraphPayload): void {
  if (!graph || !buffers) return;
  const next = buildBuffers(data, theme);
  next.positions.set(graph.getPointPositions());
  buffers = next;
  graph.setPointColors(next.colors);
  graph.setLinkColors(next.linkColors);
  graph.setLinkWidths(next.linkWidths);
  graph.render();
  paintLabels(graph);
}

let lastPayload: GraphPayload | null = null;

function applyThemeAndRecolor(next: "light" | "dark"): void {
  isDark = next === "dark";
  theme = isDark ? THEME_DARK : THEME_LIGHT;
  document.body.setAttribute("data-theme", next);
  if (lastPayload && graph) {
    recolorFromPayload(lastPayload);
    graph.setConfigPartial({ backgroundColor: theme.background });
  }
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

function renderGraph(data: GraphPayload): void {
  lastPayload = data;
  createGraph(data);

  const edgeTotal = data.stats.relatesToEdgeCount + data.stats.tagEdgeCount;
  statsEl.textContent = `${formatCount(data.stats.nodeCount)} memories · ${formatCount(edgeTotal)} edges`;
  if (legendStatsEl) {
    legendStatsEl.textContent = `${formatCount(data.stats.nodeCount)} nodes · ${formatCount(data.stats.relatesToEdgeCount)} relates · ${formatCount(data.stats.tagEdgeCount)} tags`;
  }
  hintEl.textContent = "Drag to pan · Scroll to zoom · Drag nodes";

  if (data.truncated) {
    bannerEl.textContent = `Showing ${formatCount(data.stats.nodeCount)} of ${formatCount(data.stats.totalNodesBeforeCap)} memories. Use focus or memoryIds to narrow.`;
    bannerEl.classList.add("visible");
  } else {
    bannerEl.classList.remove("visible");
  }

  requestTallViewport();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGraphStats(value: unknown): value is GraphPayload["stats"] {
  if (value === null || typeof value !== "object") return false;
  return (
    "nodeCount" in value &&
    isFiniteNumber(value.nodeCount) &&
    "relatesToEdgeCount" in value &&
    isFiniteNumber(value.relatesToEdgeCount) &&
    "tagEdgeCount" in value &&
    isFiniteNumber(value.tagEdgeCount) &&
    "totalNodesBeforeCap" in value &&
    isFiniteNumber(value.totalNodesBeforeCap)
  );
}

function isGraphPayload(value: object): value is GraphPayload {
  return (
    "nodes" in value &&
    Array.isArray(value.nodes) &&
    "relatesToEdges" in value &&
    Array.isArray(value.relatesToEdges) &&
    "tagEdges" in value &&
    Array.isArray(value.tagEdges) &&
    "stats" in value &&
    isGraphStats(value.stats)
  );
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

if (btnZoomIn instanceof HTMLButtonElement) {
  btnZoomIn.addEventListener("click", () => {
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_IN_FACTOR);
    paintLabels(graph);
  });
}
if (btnZoomOut instanceof HTMLButtonElement) {
  btnZoomOut.addEventListener("click", () => {
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_OUT_FACTOR);
    paintLabels(graph);
  });
}
if (btnFit instanceof HTMLButtonElement) {
  btnFit.addEventListener("click", () => {
    if (!graph) return;
    graph.fitView();
    paintLabels(graph);
  });
}

window.addEventListener("resize", () => {
  if (graph) paintLabels(graph);
});

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
    destroyGraph();
    lastPayload = null;
    statsEl.textContent = "No memories to display";
    return;
  }
  renderGraph(data);
};

app.ontoolcancelled = () => {
  loadingEl.classList.add("hidden");
  statsEl.textContent = "Cancelled";
};

// Once the host sets a theme, OS prefers-color-scheme must not override it.
let hostThemeLocked = false;

function handleHostContext(hostCtx: McpUiHostContext) {
  if (hostCtx.theme) {
    hostThemeLocked = true;
    applyDocumentTheme(hostCtx.theme);
    applyThemeAndRecolor(hostCtx.theme);
  }
}

app.onhostcontextchanged = handleHostContext;

app.onteardown = async () => {
  destroyGraph();
  return {};
};

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
applyThemeAndRecolor(prefersDark.matches ? "dark" : "light");
prefersDark.addEventListener("change", (e) => {
  if (hostThemeLocked) return;
  applyThemeAndRecolor(e.matches ? "dark" : "light");
});

void app.connect().then(() => {
  const hostCtx = app.getHostContext();
  if (hostCtx) handleHostContext(hostCtx);
  requestTallViewport();
});
