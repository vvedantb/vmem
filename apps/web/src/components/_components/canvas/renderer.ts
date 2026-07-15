import type {
  GraphEdgeType,
  GraphNode,
  GraphNodeKind,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "./types";
import type { GraphViewTheme } from "../graph-view-themes";
import { nodeColor as getNodeColor } from "../graph-colors";
import type { ConnectorLogoMap } from "./connector-logos";
import { getConnectorLogo } from "./connector-logos";

const TWO_PI = Math.PI * 2;

// palette slots on GraphViewTheme.edge.normalByType — codebase edges reuse memory hues
type EdgePaletteSlot = keyof GraphViewTheme["edge"]["normalByType"];

interface EdgeStyle {
  slot: EdgePaletteSlot;
  widthMult: number;
  label: string;
}

export const EDGE_STYLE: Record<GraphEdgeType, EdgeStyle> = {
  tag: { slot: "tag", widthMult: 1, label: "tagged" },
  relates_to: { slot: "relates_to", widthMult: 2, label: "relates to" },
  imports: { slot: "relates_to", widthMult: 2, label: "imports" },
  calls: { slot: "relates_to", widthMult: 2, label: "calls" },
  wiki_parent: { slot: "wiki_parent", widthMult: 2, label: "parent of" },
  contains: { slot: "wiki_parent", widthMult: 2, label: "contains" },
  has_method: { slot: "wiki_parent", widthMult: 2, label: "has method" },
  extends: { slot: "wiki_parent", widthMult: 2, label: "extends" },
  implements: { slot: "wiki_parent", widthMult: 2, label: "implements" },
  mentions: { slot: "mentions", widthMult: 2, label: "mentions" },
  starts_process: { slot: "mentions", widthMult: 2, label: "starts process" },
  includes: { slot: "mentions", widthMult: 2, label: "includes" },
};

const EDGE_PALETTE_SLOTS: readonly EdgePaletteSlot[] = [
  "tag",
  "relates_to",
  "wiki_parent",
  "mentions",
];

const ALL_EDGE_TYPES = Object.keys(EDGE_STYLE) as GraphEdgeType[];

function makeIsDimmed(
  hasHover: boolean,
  hoveredNodeId: string | null,
  neighborSet: Set<string>,
  isSearchActive: boolean,
  searchMatchSet: Set<string>,
): (nodeId: string) => boolean {
  return (nodeId) =>
    (hasHover && nodeId !== hoveredNodeId && !neighborSet.has(nodeId)) ||
    (isSearchActive && !searchMatchSet.has(nodeId));
}

// per-node color cache — avoid hashing/getComputedStyle every frame
let colorCacheTheme: GraphViewTheme | null = null;
let colorCache = new WeakMap<GraphNode, string>();

function nodeColor(node: GraphNode, theme: GraphViewTheme): string {
  if (colorCacheTheme !== theme) {
    colorCacheTheme = theme;
    colorCache = new WeakMap();
  }
  let color = colorCache.get(node);
  if (color === undefined) {
    color = getNodeColor(
      node.tags,
      node.kind,
      theme.isDarkCanvas,
      theme.nodeColorOverride,
    );
    colorCache.set(node, color);
  }
  return color;
}

// truncate labels once — fillText maxWidth is a slow path
const LABEL_MAX_CHARS = 26;
const labelCache = new WeakMap<GraphNode, string>();

function nodeLabel(node: GraphNode): string {
  let label = labelCache.get(node);
  if (label === undefined) {
    label =
      node.title.length > LABEL_MAX_CHARS
        ? node.title.slice(0, LABEL_MAX_CHARS - 1) + "…"
        : node.title;
    labelCache.set(node, label);
  }
  return label;
}

// cache (kind,color) buckets across frames — rebuild only when nodes/theme change
interface NodeBucket {
  color: string;
  kind: GraphNodeKind;
  nodes: GraphNode[];
}
let bucketCacheNodes: GraphNode[] | null = null;
let bucketCacheTheme: GraphViewTheme | null = null;
let bucketCache: NodeBucket[] = [];

function nodeBuckets(nodes: GraphNode[], theme: GraphViewTheme): NodeBucket[] {
  if (bucketCacheNodes === nodes && bucketCacheTheme === theme) {
    return bucketCache;
  }
  const buckets = new Map<string, NodeBucket>();
  for (const node of nodes) {
    const color = nodeColor(node, theme);
    const key = `${node.kind}|${color}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.nodes.push(node);
    else buckets.set(key, { color, kind: node.kind, nodes: [node] });
  }
  bucketCacheNodes = nodes;
  bucketCacheTheme = theme;
  bucketCache = [...buckets.values()];
  return bucketCache;
}

// shapes inscribed in radius r so hit-test/glow/collision stay radius-based
function traceCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TWO_PI);
}

function traceSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  // square inscribed in circle; scale so visual mass ≈ circle
  const half = r * Math.SQRT1_2 * 1.15;
  ctx.moveTo(x - half, y - half);
  ctx.lineTo(x + half, y - half);
  ctx.lineTo(x + half, y + half);
  ctx.lineTo(x - half, y + half);
  ctx.closePath();
}

function traceDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  // diamond: cardinal points on the circle
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function traceHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  // flat-top hex; vertices every 60° on the circle
  ctx.moveTo(x + r, y);
  for (let i = 1; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  ctx.closePath();
}

// 8-point starburst for entity hubs (outer/inner radii)
function traceStarburst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  const points = 8;
  const inner = r * 0.5;
  const step = Math.PI / points;
  ctx.moveTo(x + r, y);
  for (let i = 1; i < points * 2; i++) {
    const angle = step * i;
    const radius = i % 2 === 0 ? r : inner;
    ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
  }
  ctx.closePath();
}

function traceShape(
  ctx: CanvasRenderingContext2D,
  kind: GraphNodeKind,
  x: number,
  y: number,
  r: number,
): void {
  if (kind === "wiki-folder") return traceSquare(ctx, x, y, r);
  if (kind === "wiki-document") return traceDiamond(ctx, x, y, r);
  if (kind === "skill") return traceHexagon(ctx, x, y, r);
  if (kind === "entity") return traceStarburst(ctx, x, y, r);
  // codebase kinds reuse the same shape vocabulary
  if (kind === "code-file") return traceSquare(ctx, x, y, r);
  if (kind === "code-class") return traceHexagon(ctx, x, y, r);
  if (kind === "code-interface") return traceDiamond(ctx, x, y, r);
  if (kind === "code-process") return traceStarburst(ctx, x, y, r);
  // code-function → circle (same as memory)
  return traceCircle(ctx, x, y, r);
}

function isOnScreen(
  x: number,
  y: number,
  radius: number,
  vp: ViewportState,
  canvasW: number,
  canvasH: number,
): boolean {
  const sx = x * vp.scale + vp.offsetX + canvasW / 2;
  const sy = y * vp.scale + vp.offsetY + canvasH / 2;
  const sr = radius * vp.scale + 20;
  return sx + sr > 0 && sx - sr < canvasW && sy + sr > 0 && sy - sr < canvasH;
}

// cached scene bitmap for O(1) pan/zoom blit; settle frame re-renders crisp
export interface WorldLayerCache {
  layer: HTMLCanvasElement | null;
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  dpr: number;
  valid: boolean;
}

export function createWorldLayerCache(): WorldLayerCache {
  return {
    layer: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    dpr: 1,
    valid: false,
  };
}

export interface RenderFrameState {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  dpr: number;
  nodes: GraphNode[];
  edges: ResolvedEdge[];
  vp: ViewportState;
  interaction: InteractionState;
  theme: GraphViewTheme;
  neighborSet: Set<string>;
  focusNodeId: string | null;
  searchMatchSet: Set<string>;
  isSearchActive: boolean;
  showLabels: boolean;
  connectorLogos: ConnectorLogoMap;
  // null cache = always draw direct (small graphs stay sharp mid-gesture)
  worldCache: WorldLayerCache | null;
  // true when only the viewport moved — blit-eligible
  viewportOnly: boolean;
  // pan/zoom in flight: gesture renders skip glow; settle restores it
  gestureActive: boolean;
}

export function render(frame: RenderFrameState): void {
  const { ctx, canvasW, canvasH, dpr, vp, theme, worldCache, viewportOnly } =
    frame;

  // blit: pan/zoom over a fresh cache
  if (
    worldCache &&
    viewportOnly &&
    worldCache.valid &&
    worldCache.layer &&
    worldCache.width === canvasW &&
    worldCache.height === canvasH &&
    worldCache.dpr === dpr
  ) {
    const k = vp.scale / worldCache.scale;
    const dx =
      vp.offsetX + canvasW / 2 - k * (worldCache.offsetX + canvasW / 2);
    const dy =
      vp.offsetY + canvasH / 2 - k * (worldCache.offsetY + canvasH / 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);
    // solid background behind the transformed bitmap so margins it no longer
    // covers (zoom-out, pan) show theme color instead of garbage
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * dx, dpr * dy);
    ctx.drawImage(worldCache.layer, 0, 0, canvasW, canvasH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return;
  }

  // full render
  if (worldCache) {
    if (!worldCache.layer) {
      worldCache.layer = document.createElement("canvas");
    }
    const layer = worldCache.layer;
    if (layer.width !== canvasW * dpr || layer.height !== canvasH * dpr) {
      layer.width = canvasW * dpr;
      layer.height = canvasH * dpr;
    }
    const layerCtx = layer.getContext("2d");
    if (layerCtx) {
      renderScene({ ...frame, ctx: layerCtx });
      worldCache.scale = vp.scale;
      worldCache.offsetX = vp.offsetX;
      worldCache.offsetY = vp.offsetY;
      worldCache.width = canvasW;
      worldCache.height = canvasH;
      worldCache.dpr = dpr;
      worldCache.valid = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.drawImage(layer, 0, 0, canvasW, canvasH);
      return;
    }
  }

  renderScene(frame);
}

function renderScene(frame: RenderFrameState): void {
  const {
    ctx,
    canvasW,
    canvasH,
    dpr,
    nodes,
    edges,
    vp,
    interaction,
    theme,
    neighborSet,
    focusNodeId,
    searchMatchSet,
    isSearchActive,
    showLabels,
    connectorLogos,
    gestureActive,
  } = frame;

  const nodeById = new Map<string, GraphNode>();
  for (const node of nodes) nodeById.set(node.id, node);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (theme.gradientCenter) {
    const grad = ctx.createRadialGradient(
      canvasW / 2,
      canvasH / 2,
      0,
      canvasW / 2,
      canvasH / 2,
      canvasW / 2,
    );
    grad.addColorStop(0, theme.gradientCenter);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  if (theme.grid) {
    const { color, spacing } = theme.grid;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    const sSpacing = spacing * vp.scale;
    const ox = (vp.offsetX + canvasW / 2) % sSpacing;
    const oy = (vp.offsetY + canvasH / 2) % sSpacing;
    for (let x = ox; x < canvasW; x += sSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
    for (let y = oy; y < canvasH; y += sSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(canvasW / 2 + vp.offsetX, canvasH / 2 + vp.offsetY);
  ctx.scale(vp.scale, vp.scale);

  const nodeCount = nodes.length;
  // hover dim/highlight repaints the whole scene per mousemove
  const hoverVisuals = !(nodeCount > 5000 && vp.scale < 0.4);
  const hoveredNodeId = hoverVisuals ? interaction.hoveredNodeId : null;
  const hoveredEdgeIndexVisual = hoverVisuals
    ? interaction.hoveredEdgeIndex
    : null;
  const hasHover = hoveredNodeId !== null || hoveredEdgeIndexVisual !== null;
  // edges only enter hover mode (dim non-connected, highlight connected) when the hovered…
  const hasHoveredNeighbors = hasHover && neighborSet.size > 1;
  const isDimmed = makeIsDimmed(
    hasHover,
    hoveredNodeId,
    neighborSet,
    isSearchActive,
    searchMatchSet,
  );
  const lowZoom = vp.scale < 0.4;
  const veryLowZoom = vp.scale < 0.08;
  const highNodeCount = nodeCount > 5000;

  // world-space view bounds (small margin) for edge culling
  const viewMinX = (-canvasW / 2 - vp.offsetX) / vp.scale - 40;
  const viewMaxX = (canvasW / 2 - vp.offsetX) / vp.scale + 40;
  const viewMinY = (-canvasH / 2 - vp.offsetY) / vp.scale - 40;
  const viewMaxY = (canvasH / 2 - vp.offsetY) / vp.scale + 40;
  const edgeVisible = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): boolean =>
    !(
      (x1 < viewMinX && x2 < viewMinX) ||
      (x1 > viewMaxX && x2 > viewMaxX) ||
      (y1 < viewMinY && y2 < viewMinY) ||
      (y1 > viewMaxY && y2 > viewMaxY)
    );

  // --- Edges (batched by palette slot — single beginPath/stroke per slot) ---
  // skip ALL edges at very low zoom (just render node dots)
  if (!veryLowZoom && edges.length > 0) {
    // edge budget: skip tag edges when total edge count is very high, and on any edge-heavy…
    const skipTagEdges =
      edges.length > 10_000 || (gestureActive && edges.length > 1500);

    if (!hasHoveredNeighbors) {
      for (const slot of EDGE_PALETTE_SLOTS) {
        if (slot === "tag" && skipTagEdges) continue;
        const widthMult = slot === "tag" ? 1 : 2;
        ctx.strokeStyle = theme.edge.normalByType[slot];
        ctx.lineWidth = theme.edge.width * widthMult;
        ctx.beginPath();
        for (const edge of edges) {
          if (EDGE_STYLE[edge.edgeType].slot !== slot) continue;
          const sx = edge.source.x ?? 0;
          const sy = edge.source.y ?? 0;
          const tx = edge.target.x ?? 0;
          const ty = edge.target.y ?? 0;
          if (!edgeVisible(sx, sy, tx, ty)) continue;
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
      }
    } else {
      // hover: dim non-connected edges, then draw connected on top
      for (const edgeType of ALL_EDGE_TYPES) {
        if (edgeType === "tag" && skipTagEdges) continue;
        const style = EDGE_STYLE[edgeType];
        const isStrongEdge = style.widthMult > 1;
        const typeColor = theme.edge.normalByType[style.slot];

        // pass 1: dimmed edges (everything not connected to the hovered node)
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = theme.edge.width * style.widthMult;
        ctx.globalAlpha = theme.dimAlpha * (isStrongEdge ? 1 : 2);
        ctx.beginPath();
        for (const edge of edges) {
          if (edge.edgeType !== edgeType) continue;
          const isConnected =
            neighborSet.has(edge.source.id) && neighborSet.has(edge.target.id);
          if (isConnected) continue;
          const sx = edge.source.x ?? 0;
          const sy = edge.source.y ?? 0;
          const tx = edge.target.x ?? 0;
          const ty = edge.target.y ?? 0;
          if (!edgeVisible(sx, sy, tx, ty)) continue;
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // pass 2: connected edges (on top) — single `connected` hue across all
        // types signals "lit up" consistently, 1.5× width for unmistakability
        ctx.strokeStyle = theme.edge.connected;
        ctx.lineWidth = theme.edge.connectedWidth * style.widthMult * 1.5;
        ctx.beginPath();
        for (const edge of edges) {
          if (edge.edgeType !== edgeType) continue;
          const isConnected =
            neighborSet.has(edge.source.id) && neighborSet.has(edge.target.id);
          if (!isConnected) continue;
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        }
        ctx.stroke();
      }
    }

    // hovered-edge emphasis pass: re-stroke the single hovered edge in the "connected" hue…
    const hoveredEdgeIdx = hoveredEdgeIndexVisual;
    if (hoveredEdgeIdx !== null && hoveredEdgeIdx < edges.length) {
      const edge = edges[hoveredEdgeIdx];
      if (edge) {
        ctx.strokeStyle = theme.edge.connected;
        ctx.lineWidth = theme.edge.connectedWidth * 1.8;
        ctx.beginPath();
        ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
        ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        ctx.stroke();
      }
    }
  }

  // nodes — skip glow past budget / low zoom / pan-zoom (expensive per node)
  const glowNodeBudget = 1500;
  if (
    theme.glow.enabled &&
    !lowZoom &&
    !gestureActive &&
    nodeCount <= glowNodeBudget
  ) {
    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = hoveredNodeId === node.id;
      if (isDimmed(node.id)) continue;

      const color = nodeColor(node, theme);
      // clamp the *glow* radius source (not the node's visual size) so a
      // degree-500 super-hub doesn't paint a screen-filling radial gradient
      const glowR = Math.min(node.size, 10) * 2;
      const glowRadius = glowR * theme.glow.radiusMultiplier;
      const intensity = isHovered
        ? theme.glow.hoveredIntensity
        : theme.glow.intensity;
      const grad = ctx.createRadialGradient(
        nx,
        ny,
        glowR * 0.5,
        nx,
        ny,
        glowRadius,
      );
      // do not append hex alpha (`color + "26"`) — untagged nodes resolve `--muted` to…
      grad.addColorStop(0, color);
      grad.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = intensity;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nx, ny, glowRadius, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    }
  }

  // node shape pass: batched by (color, kind) so we keep O(unique (color,kind))
  // draw calls. Bucket grouping is cached per (nodes, theme) — see nodeBuckets
  {
    const buckets = nodeBuckets(nodes, theme);
    // when nothing is hovered and no search is active, no node can be dimmed —
    // skip the per-node Set lookups AND the entire second (dimmed) pass
    const needDimChecks = hasHover || isSearchActive;
    // below ~2.2 screen pixels a circle/diamond/hexagon is indistinguishable from a square,…
    const tinyShapes = 2.2;
    // world-space length of 4 screen px: keeps nodes visible at extreme
    // zoom-out; sqrt-blend preserves hub/leaf ranking at all zoom levels
    const minWorld = 4 / vp.scale;

    for (const dimPass of needDimChecks ? [false, true] : [false]) {
      if (dimPass) ctx.globalAlpha = theme.dimAlpha;

      for (const { color, kind, nodes: bucket } of buckets) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const node of bucket) {
          const nx = node.x ?? 0;
          const ny = node.y ?? 0;
          const baseRadius = node.size * 2;
          if (!lowZoom && !isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH))
            continue;
          if (needDimChecks) {
            if (isDimmed(node.id) !== dimPass) continue;
          }

          const radius = Math.sqrt(
            baseRadius * baseRadius + minWorld * minWorld,
          );
          if (radius * vp.scale < tinyShapes) {
            ctx.rect(nx - radius, ny - radius, radius * 2, radius * 2);
          } else {
            traceShape(ctx, kind, nx, ny, radius);
          }
        }
        ctx.fill();
      }

      if (dimPass) ctx.globalAlpha = 1;
    }
  }

  // connector-logo pass: stamp the sourceType's brand logo inside the circle for memories…
  if (!lowZoom && !highNodeCount && connectorLogos.size > 0) {
    for (const node of nodes) {
      if (node.kind !== "memory") continue;
      const logo = getConnectorLogo(node.sourceType, connectorLogos);
      if (!logo) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isDimmedNode = isDimmed(node.id);

      // logo sits inset inside the circle so the tag-hash ring remains visible
      // around it — topic colour and provenance read as two distinct signals
      const logoSize = baseRadius * 1.4;
      const logoHalf = logoSize / 2;

      ctx.save();
      if (isDimmedNode) ctx.globalAlpha = theme.dimAlpha;
      ctx.beginPath();
      ctx.arc(nx, ny, baseRadius, 0, TWO_PI);
      ctx.clip();
      ctx.drawImage(logo, nx - logoHalf, ny - logoHalf, logoSize, logoSize);
      ctx.restore();
    }
  }

  // outlines pass: only for hovered/dragged/outlined nodes (few nodes, no batch needed)
  if (
    !lowZoom &&
    (theme.outline.enabled ||
      hoveredNodeId !== null ||
      interaction.draggedNodeId !== null)
  ) {
    for (const node of nodes) {
      const isHovered = hoveredNodeId === node.id;
      const isDragged = interaction.draggedNodeId === node.id;
      if (!theme.outline.enabled && !isHovered && !isDragged) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      if (isDimmed(node.id)) continue;

      const color = nodeColor(node, theme);
      const outlineColor =
        isHovered || isDragged
          ? theme.outline.hoveredColor === "node"
            ? color
            : theme.outline.hoveredColor
          : theme.outline.color;
      const outlineWidth =
        isHovered || isDragged
          ? theme.outline.hoveredWidth
          : theme.outline.width;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth;
      ctx.beginPath();
      traceShape(ctx, node.kind, nx, ny, baseRadius + outlineWidth);
      ctx.stroke();
    }
  }

  // --- Focus node highlight ring (always visible, even at low zoom) ---
  if (focusNodeId) {
    const focusNode = nodeById.get(focusNodeId);
    if (focusNode) {
      const nx = focusNode.x ?? 0;
      const ny = focusNode.y ?? 0;
      const baseRadius = focusNode.size * 2;
      const ringRadius = baseRadius * 1.5 + 4;
      ctx.strokeStyle = theme.isDarkCanvas
        ? "rgba(255,255,255,0.7)"
        : "rgba(0,0,0,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(nx, ny, ringRadius, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // edge labels --- Labels only ever draw for the hovered edge / hovered node's edges,…
  const hoveredEdgeIdx = hoveredEdgeIndexVisual;
  if (!lowZoom && (hoveredEdgeIdx !== null || hasHoveredNeighbors)) {
    const fontSize = Math.max(8, 10 / Math.max(vp.scale, 0.5));
    ctx.font = `400 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge) continue;
      const isHoveredEdge = hoveredEdgeIdx === i;
      const isHoveredNodeEdge =
        hasHoveredNeighbors &&
        neighborSet.has(edge.source.id) &&
        neighborSet.has(edge.target.id);
      if (!isHoveredEdge && !isHoveredNodeEdge) continue;

      const label = EDGE_STYLE[edge.edgeType].label;

      const mx = ((edge.source.x ?? 0) + (edge.target.x ?? 0)) / 2;
      const my = ((edge.source.y ?? 0) + (edge.target.y ?? 0)) / 2;

      const metrics = ctx.measureText(label);
      const padX = 4;
      const padY = 2;
      const bgW = metrics.width + padX * 2;
      const bgH = fontSize + padY * 2;

      ctx.fillStyle = theme.background + "cc";
      ctx.beginPath();
      ctx.roundRect(mx - bgW / 2, my - bgH / 2, bgW, bgH, 3);
      ctx.fill();

      ctx.fillStyle = theme.label.secondary;
      ctx.fillText(label, mx, my);
    }
  }

  // --- Node labels: skip when toggled off, at high node count, or very low zoom ---
  if (showLabels && !lowZoom && !highNodeCount) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const fontSize = Math.max(10, 12 / Math.max(vp.scale, 0.5));
    ctx.font = `500 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;

    // obsidian-style label thinning: only caption a node big enough on screen to read
    const minLabelScreenR = 6;

    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;

      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = hoveredNodeId === node.id;
      const isNeighbor = neighborSet.has(node.id);
      if (isDimmed(node.id)) continue;

      // neighbour labels get a lenient gate (half the resting threshold): hover should reveal…
      const bigEnough = baseRadius * vp.scale >= minLabelScreenR;
      const neighborBigEnough = baseRadius * vp.scale >= minLabelScreenR / 2;
      const showLabel =
        isHovered ||
        (isNeighbor && neighborBigEnough) ||
        (!hasHover && bigEnough);
      if (!showLabel) continue;

      ctx.fillStyle = isHovered ? theme.label.color : theme.label.secondary;
      ctx.fillText(nodeLabel(node), nx, ny + baseRadius + 4);
    }
  }

  ctx.restore();

  // --- Link drag line ---
  if (interaction.linkSourceId) {
    const sourceNode = nodeById.get(interaction.linkSourceId);
    if (sourceNode) {
      const sx = (sourceNode.x ?? 0) * vp.scale + vp.offsetX + canvasW / 2;
      const sy = (sourceNode.y ?? 0) * vp.scale + vp.offsetY + canvasH / 2;
      const mx = interaction.mouseWorldX * vp.scale + vp.offsetX + canvasW / 2;
      const my = interaction.mouseWorldY * vp.scale + vp.offsetY + canvasH / 2;

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = theme.label.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);

      if (
        interaction.hoveredNodeId &&
        interaction.hoveredNodeId !== interaction.linkSourceId
      ) {
        const target = nodeById.get(interaction.hoveredNodeId);
        if (target) {
          const tx = (target.x ?? 0) * vp.scale + vp.offsetX + canvasW / 2;
          const ty = (target.y ?? 0) * vp.scale + vp.offsetY + canvasH / 2;
          ctx.strokeStyle = theme.label.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tx, ty, target.size * 2 * vp.scale + 8, 0, TWO_PI);
          ctx.stroke();
        }
      }
    }
  }
}
