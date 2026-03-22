import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { SimNode, SimEdge, GraphSettings } from "./graph-types";
import type { GraphViewTheme } from "./graph-view-themes";

const INITIAL_ITERATIONS = 80;
const SPRING_LENGTH = 140;
const SPRING_STRENGTH = 0.0006;
const CENTER_GRAVITY = 0.004;
const MAX_SPEED = 1.5;

function buildFA2Settings(settings: GraphSettings) {
  return {
    linLogMode: true,
    outboundAttractionDistribution: true,
    adjustSizes: false,
    edgeWeightInfluence: 1,
    scalingRatio: settings.scalingRatio,
    strongGravityMode: false,
    gravity: settings.gravity,
    slowDown: 2,
    barnesHutOptimize: true,
    barnesHutTheta: 0.5,
  };
}

export function createLayoutGraph(nodes: SimNode[], edges: SimEdge[]): Graph {
  const graph = new Graph();

  for (let i = 0; i < nodes.length; i++) {
    graph.addNode(String(i), { x: nodes[i].x, y: nodes[i].y });
  }

  for (const edge of edges) {
    graph.addEdge(String(edge.sourceIndex), String(edge.targetIndex), {
      weight: edge.weight,
    });
  }

  return graph;
}

function readPositions(graph: Graph, nodes: SimNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const attrs = graph.getNodeAttributes(String(i));
    nodes[i].x = Number(attrs.x);
    nodes[i].y = Number(attrs.y);
    nodes[i].vx = 0;
    nodes[i].vy = 0;
  }
}

export function runInitialLayout(
  graph: Graph,
  nodes: SimNode[],
  settings: GraphSettings,
): void {
  forceAtlas2.assign(graph, {
    iterations: INITIAL_ITERATIONS,
    settings: buildFA2Settings(settings),
  });

  readPositions(graph, nodes);
}

const GRID_CELL_SIZE = 200;

export function simulationTick(
  nodes: SimNode[],
  edges: SimEdge[],
  settings: GraphSettings,
  pinnedIndex: number | null,
): void {
  const len = nodes.length;

  const grid = new Map<number, number[]>();
  const cellXs = new Int32Array(len);
  const cellYs = new Int32Array(len);

  for (let i = 0; i < len; i++) {
    const cx = Math.floor(nodes[i].x / GRID_CELL_SIZE);
    const cy = Math.floor(nodes[i].y / GRID_CELL_SIZE);
    cellXs[i] = cx;
    cellYs[i] = cy;
    const key = cx * 73856093 + cy * 19349663;
    const cell = grid.get(key);
    if (cell) cell.push(i);
    else grid.set(key, [i]);
  }

  for (let i = 0; i < len; i++) {
    const cx = cellXs[i];
    const cy = cellYs[i];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = (cx + dx) * 73856093 + (cy + dy) * 19349663;
        const cell = grid.get(key);
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const ddx = nodes[j].x - nodes[i].x;
          const ddy = nodes[j].y - nodes[i].y;
          const distSq = ddx * ddx + ddy * ddy + 1;
          const dist = Math.sqrt(distSq);
          const force = settings.repulsion / distSq;
          const fx = (ddx / dist) * force;
          const fy = (ddy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }
    }
  }

  for (const edge of edges) {
    const s = nodes[edge.sourceIndex];
    const t = nodes[edge.targetIndex];
    const ddx = t.x - s.x;
    const ddy = t.y - s.y;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) + 0.1;
    const displacement = dist - SPRING_LENGTH;
    const force = SPRING_STRENGTH * displacement * edge.weight;
    const fx = (ddx / dist) * force;
    const fy = (ddy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  for (let i = 0; i < len; i++) {
    if (i === pinnedIndex) continue;
    const node = nodes[i];
    node.vx -= node.x * CENTER_GRAVITY;
    node.vy -= node.y * CENTER_GRAVITY;
    node.vx *= settings.damping;
    node.vy *= settings.damping;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > MAX_SPEED) {
      node.vx = (node.vx / speed) * MAX_SPEED;
      node.vy = (node.vy / speed) * MAX_SPEED;
    }
    node.x += node.vx;
    node.y += node.vy;
  }
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function hexAlpha(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function renderGraph(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number,
  camera: Camera,
  hoveredIndex: number | null,
  connectedSet: Set<number>,
  theme: GraphViewTheme,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  if (theme.gradientCenter) {
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.5,
    );
    grad.addColorStop(0, theme.gradientCenter);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  if (theme.grid) {
    const invZ = 1 / camera.zoom;
    const halfW = (width / 2) * invZ;
    const halfH = (height / 2) * invZ;
    const left = camera.x - halfW;
    const right = camera.x + halfW;
    const top = camera.y - halfH;
    const bottom = camera.y + halfH;
    const sp = theme.grid.spacing;

    ctx.strokeStyle = theme.grid.color;
    ctx.lineWidth = 0.5 * invZ;
    ctx.beginPath();
    const startX = Math.floor(left / sp) * sp;
    const startY = Math.floor(top / sp) * sp;
    for (let x = startX; x <= right; x += sp) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y <= bottom; y += sp) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
  }

  const hasHover = hoveredIndex !== null;
  const invZoom = 1 / camera.zoom;

  for (const edge of edges) {
    const s = nodes[edge.sourceIndex];
    const t = nodes[edge.targetIndex];
    const edgeOpacity = Math.min(s.opacity, t.opacity);
    if (edgeOpacity <= 0) continue;
    const connected =
      hasHover &&
      connectedSet.has(edge.sourceIndex) &&
      connectedSet.has(edge.targetIndex);
    const dimmed = hasHover && !connected;
    ctx.globalAlpha = edgeOpacity;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);

    ctx.strokeStyle = dimmed
      ? theme.edge.dimmed
      : connected
        ? theme.edge.connected
        : theme.edge.normal;

    ctx.lineWidth =
      (connected ? theme.edge.connectedWidth : theme.edge.width) * invZoom;
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.opacity <= 0) continue;
    const isHovered = i === hoveredIndex;
    const isConnected = connectedSet.has(i);
    const dimmed = hasHover && !isConnected;
    const r = (isHovered ? node.radius * 1.5 : node.radius) * invZoom;

    ctx.globalAlpha = (dimmed ? theme.dimAlpha : 1) * node.opacity;

    if (theme.glow.enabled && !dimmed) {
      const glowRadius = r * theme.glow.radiusMultiplier;
      const intensity = isHovered
        ? theme.glow.hoveredIntensity
        : theme.glow.intensity;
      const glow = ctx.createRadialGradient(
        node.x,
        node.y,
        0,
        node.x,
        node.y,
        glowRadius,
      );
      glow.addColorStop(0, node.color + hexAlpha(intensity));
      glow.addColorStop(0.08, node.color + hexAlpha(intensity * 0.7));
      glow.addColorStop(0.25, node.color + hexAlpha(intensity * 0.2));
      glow.addColorStop(0.5, node.color + hexAlpha(intensity * 0.05));
      glow.addColorStop(1, node.color + "00");
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();

    if (theme.outline.enabled && !dimmed) {
      const hovColor =
        theme.outline.hoveredColor === "node"
          ? node.color
          : theme.outline.hoveredColor;
      ctx.strokeStyle = isHovered ? hovColor : theme.outline.color;
      ctx.lineWidth =
        (isHovered ? theme.outline.hoveredWidth : theme.outline.width) *
        invZoom;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  const maxLabelLen = 20;
  const truncate = (s: string) =>
    s.length > maxLabelLen ? s.slice(0, maxLabelLen - 1) + "…" : s;

  if (hasHover) {
    const fontSize = 14 * invZoom;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const hovNode = nodes[hoveredIndex];
    ctx.font = `600 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillStyle = theme.label.color;
    const hovOffset = (hovNode.radius + 6) * invZoom;
    ctx.fillText(truncate(hovNode.label), hovNode.x, hovNode.y + hovOffset);

    ctx.font = `400 ${fontSize * 0.9}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillStyle = theme.label.secondary;
    for (const idx of connectedSet) {
      if (idx === hoveredIndex) continue;
      const node = nodes[idx];
      const offset = (node.radius + 5) * invZoom;
      ctx.fillText(truncate(node.label), node.x, node.y + offset);
    }
  } else if (camera.zoom > 2.5) {
    const fontSize = 12 * invZoom;
    ctx.font = `400 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = theme.label.secondary;
    for (const node of nodes) {
      const offset = (node.radius + 5) * invZoom;
      ctx.fillText(truncate(node.label), node.x, node.y + offset);
    }
  }

  ctx.restore();
}
