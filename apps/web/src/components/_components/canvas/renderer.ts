import type {
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

// ── Per-node color cache ──────────────────────────────────────────────────────
// nodeColor hashes the first tag and builds a hex string — and for untagged
// memories reads getComputedStyle (forced style recalc). Computing it per node
// per pass per frame dominates frame time on large graphs, so colors are
// cached per node object and invalidated when the theme object changes (node
// objects are recreated on data swaps, so WeakMap entries age out naturally).
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

// ── Per-node label cache ──────────────────────────────────────────────────────
// fillText's maxWidth argument forces a measure+horizontal-squish slow path in
// every browser — the single most expensive way to cap label width. Truncating
// to a character budget once per node (≈ what 150px fit at the 12px base font)
// renders with the fast fillText overload and looks better: an ellipsis
// instead of squished glyphs. Node objects are recreated on data swaps, so
// WeakMap entries age out naturally.
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

// ── Per-dataset bucket cache ──────────────────────────────────────────────────
// Grouping nodes by (kind, color) lets the shape pass batch one beginPath/fill
// per bucket — but rebuilding the Map (plus 100k array pushes) every frame is
// pure GC churn. The grouping only depends on the nodes array and the theme,
// both of which are reference-stable between data swaps, so it's cached on
// identity. Culling and hover-dim stay per-frame inside the draw loop.
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

/**
 * Node shape helpers. All shapes are inscribed in a circle of the given `r`
 * so the existing hit-test, glow, and collision physics (all radius-based)
 * keep working unchanged. Each helper appends a sub-path to the caller's
 * currently-open path — callers are responsible for beginPath/fill/stroke
 * so we can batch many nodes in a single draw call.
 */
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
  // Axis-aligned square inscribed in the circle of radius r (side = r * √2).
  const half = r * Math.SQRT1_2 * 1.15; // scale slightly so visual mass ≈ circle
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
  // Square rotated 45°: the four cardinal points lie on the circle of radius r.
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
  // Flat-topped regular hexagon. i=0 places a vertex at 3 o'clock; the six
  // vertices step around the inscribing circle at 60° intervals.
  ctx.moveTo(x + r, y);
  for (let i = 1; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
  }
  ctx.closePath();
}

/**
 * 8-pointed starburst shape for entity hub nodes. Alternates between outer
 * vertices on the circle and inner vertices at half the radius, giving a
 * spiky "sun" silhouette that reads as distinct from every other shape.
 */
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
  // Codebase symbols use the same shape vocabulary as the rest of the
  // graph — this keeps the visual language consistent across views.
  if (kind === "code-file") return traceSquare(ctx, x, y, r);
  if (kind === "code-class") return traceHexagon(ctx, x, y, r);
  if (kind === "code-interface") return traceDiamond(ctx, x, y, r);
  if (kind === "code-process") return traceStarburst(ctx, x, y, r);
  // code-function falls through to circle (default for memory).
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

/**
 * Cached full-scene bitmap for viewport-only frames. While the user pans or
 * zooms (and nothing else changes), re-tracing every node and edge per frame
 * is pure waste — the previous frame's pixels are still correct, just under a
 * different viewport transform. Blitting the cached bitmap with the delta
 * transform makes pan/zoom O(1) per frame regardless of graph size; the first
 * frame after the gesture settles re-renders crisp.
 */
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

export function render(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  dpr: number,
  nodes: GraphNode[],
  edges: ResolvedEdge[],
  vp: ViewportState,
  interaction: InteractionState,
  theme: GraphViewTheme,
  neighborSet: Set<string>,
  focusNodeId: string | null,
  searchMatchSet: Set<string>,
  isSearchActive: boolean,
  showLabels: boolean,
  connectorLogos: ConnectorLogoMap,
  /** null = always draw directly (small graphs stay pixel-perfect mid-gesture) */
  worldCache: WorldLayerCache | null,
  /** True when ONLY the viewport moved since the last frame — blit-eligible */
  viewportOnly: boolean,
  /**
   * True while a pan/zoom gesture is in flight. Gesture-frame full renders
   * (snapshot refreshes) drop the glow pass — the dominant per-node cost —
   * so they fit the frame budget; the settle frame restores it.
   */
  gestureActive: boolean = false,
): void {
  // Blit path: pan/zoom in progress over an up-to-date cache.
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
    // Solid background behind the transformed bitmap so margins it no longer
    // covers (zoom-out, pan) show theme color instead of garbage.
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * dx, dpr * dy);
    ctx.drawImage(worldCache.layer, 0, 0, canvasW, canvasH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return;
  }

  // Full render. With a cache attached, render into the layer canvas and
  // stamp it 1:1 — the extra full-canvas drawImage is the price of having
  // the bitmap ready for the next gesture frame.
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
      renderScene(
        layerCtx,
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
      );
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

  renderScene(
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
  );
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  dpr: number,
  nodes: GraphNode[],
  edges: ResolvedEdge[],
  vp: ViewportState,
  interaction: InteractionState,
  theme: GraphViewTheme,
  neighborSet: Set<string>,
  focusNodeId: string | null,
  searchMatchSet: Set<string>,
  isSearchActive: boolean,
  showLabels: boolean,
  connectorLogos: ConnectorLogoMap,
  gestureActive: boolean,
): void {
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
  // Hover dim/highlight repaints the whole scene per mousemove. On huge
  // graphs at far zoom the highlighted node is sub-pixel — pure cost, no
  // signal — so hover VISUALS switch off there (tooltips still work; the
  // frame loop in GraphCanvas mirrors this so hover doesn't even repaint).
  // Must stay in sync with hoverVisualsEnabled in GraphCanvas.tsx.
  const hoverVisuals = !(nodeCount > 5000 && vp.scale < 0.4);
  const hoveredNodeId = hoverVisuals ? interaction.hoveredNodeId : null;
  const hoveredEdgeIndexVisual = hoverVisuals
    ? interaction.hoveredEdgeIndex
    : null;
  const hasHover = hoveredNodeId !== null || hoveredEdgeIndexVisual !== null;
  // Edges only enter hover mode (dim non-connected, highlight connected) when
  // the hovered node actually has neighbors. Hovering an isolated node would
  // otherwise fade the entire graph to gray with nothing to highlight.
  // neighborSet always includes the hovered node itself, so size > 1 means
  // there's at least one real neighbor.
  const hasHoveredNeighbors = hasHover && neighborSet.size > 1;
  const lowZoom = vp.scale < 0.4;
  const veryLowZoom = vp.scale < 0.08;
  const highNodeCount = nodeCount > 5000;

  // World-space view bounds (small margin) for edge culling. An edge whose
  // bounding box misses the viewport can't paint a pixel — skipping it keeps
  // the zoomed-in edge pass proportional to what's visible, not to the graph.
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

  // --- Edges (batched by style — single beginPath/stroke per style bucket) ---
  // Skip ALL edges at very low zoom (just render node dots)
  if (!veryLowZoom && edges.length > 0) {
    // Edge budget: skip tag edges when total edge count is very high, and on
    // any edge-heavy graph while a gesture is in flight — a single stroke()
    // of thousands of batched hairline segments dominates gesture-frame cost,
    // and the faint tag lattice is the least informative layer. It returns on
    // the crisp settle frame. Structural edges always draw.
    const skipTagEdges =
      edges.length > 10_000 || (gestureActive && edges.length > 1500);

    if (!hasHoveredNeighbors) {
      // No hover — three batched passes, one per edge type. Each type gets its
      // own hue via `theme.edge.normalByType` so users can read the semantic
      // category (tag / user-linked / folder-parent) at a glance.
      if (!skipTagEdges) {
        ctx.strokeStyle = theme.edge.normalByType.tag;
        ctx.lineWidth = theme.edge.width;
        ctx.beginPath();
        for (const edge of edges) {
          if (edge.edgeType !== "tag") continue;
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

      // relates_to + imports + calls — "user-forged" warm hue. Memory
      // relates_to, file imports, and function calls all read as
      // semantic connections so they share the warm slot.
      ctx.strokeStyle = theme.edge.normalByType.relates_to;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.beginPath();
      for (const edge of edges) {
        if (
          edge.edgeType !== "relates_to" &&
          edge.edgeType !== "imports" &&
          edge.edgeType !== "calls"
        )
          continue;
        const sx = edge.source.x ?? 0;
        const sy = edge.source.y ?? 0;
        const tx = edge.target.x ?? 0;
        const ty = edge.target.y ?? 0;
        if (!edgeVisible(sx, sy, tx, ty)) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();

      // wiki_parent + codebase structural edges — cool blue hue.
      // File→symbol containment, class→method, extends, implements
      // all describe structural hierarchy.
      ctx.strokeStyle = theme.edge.normalByType.wiki_parent;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.beginPath();
      for (const edge of edges) {
        if (
          edge.edgeType !== "wiki_parent" &&
          edge.edgeType !== "contains" &&
          edge.edgeType !== "has_method" &&
          edge.edgeType !== "extends" &&
          edge.edgeType !== "implements"
        )
          continue;
        const sx = edge.source.x ?? 0;
        const sy = edge.source.y ?? 0;
        const tx = edge.target.x ?? 0;
        const ty = edge.target.y ?? 0;
        if (!edgeVisible(sx, sy, tx, ty)) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();

      // mentions + process flow — teal-green hue. Entity mentions and
      // codebase process membership both signal "associated with X".
      ctx.strokeStyle = theme.edge.normalByType.mentions;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.beginPath();
      for (const edge of edges) {
        if (
          edge.edgeType !== "mentions" &&
          edge.edgeType !== "starts_process" &&
          edge.edgeType !== "includes"
        )
          continue;
        const sx = edge.source.x ?? 0;
        const sy = edge.source.y ?? 0;
        const tx = edge.target.x ?? 0;
        const ty = edge.target.y ?? 0;
        if (!edgeVisible(sx, sy, tx, ty)) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    } else {
      // Hover active — two batched passes per edge type: dimmed non-connected
      // edges first (fade into background), then connected edges on top at
      // full opacity so the hover highlight reads as a clear "lit up" line.
      //
      // Codebase edges piggyback on the memory palette slots so the renderer
      // doesn't need a per-codebase-type theme entry: behavioral edges
      // (calls/imports) ride the warm `relates_to` slot, structural edges
      // (contains/has_method/extends/implements) ride the cool `wiki_parent`
      // slot, and process flow (starts_process/includes) rides `mentions`.
      for (const edgeType of [
        "tag",
        "relates_to",
        "imports",
        "wiki_parent",
        "mentions",
        "calls",
        "contains",
        "has_method",
        "extends",
        "implements",
        "starts_process",
        "includes",
      ] as const) {
        if (edgeType === "tag" && skipTagEdges) continue;
        // Tag is the only "weak" edge type — everything else is strong so it
        // reads through the dim pass at full opacity.
        const isStrongEdge = edgeType !== "tag";
        const widthMultiplier = isStrongEdge ? 2 : 1;
        // Codebase types reuse the existing palette slots — see the comment
        // on the loop. Memory types use their own slot directly.
        const typeColor =
          edgeType === "imports" || edgeType === "calls"
            ? theme.edge.normalByType.relates_to
            : edgeType === "contains" ||
                edgeType === "has_method" ||
                edgeType === "extends" ||
                edgeType === "implements"
              ? theme.edge.normalByType.wiki_parent
              : edgeType === "starts_process" || edgeType === "includes"
                ? theme.edge.normalByType.mentions
                : theme.edge.normalByType[edgeType];

        // Pass 1: dimmed edges (everything not connected to the hovered node).
        // Use the per-type hue at reduced alpha so you can still tell the
        // background lattice apart by category while the hovered neighborhood
        // lights up.
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = theme.edge.width * widthMultiplier;
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

        // Pass 2: connected edges (on top) — single `connected` hue across all
        // types signals "lit up" consistently, 1.5× width for unmistakability.
        ctx.strokeStyle = theme.edge.connected;
        ctx.lineWidth = theme.edge.connectedWidth * widthMultiplier * 1.5;
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

    // Hovered-edge emphasis pass: re-stroke the single hovered edge in the
    // "connected" hue so the tooltip has a clear visual anchor. Runs after
    // the batched passes so it always draws on top, even when no node is
    // hovered (the common case when reading an edge tooltip).
    const hoveredEdgeIdx = hoveredEdgeIndexVisual;
    if (hoveredEdgeIdx !== null && hoveredEdgeIdx < edges.length) {
      const edge = edges[hoveredEdgeIdx];
      ctx.strokeStyle = theme.edge.connected;
      ctx.lineWidth = theme.edge.connectedWidth * 1.8;
      ctx.beginPath();
      ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
      ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
      ctx.stroke();
    }
  }

  // --- Nodes ---
  // Glow pass: one createRadialGradient + fill PER NODE per frame — by far the
  // most expensive pass (at 5k nodes it's ~80% of the frame: 23ms vs 4.6ms
  // without). Its budget is much tighter than the label cutoff: past ~1.5k
  // nodes the halos overlap into soup anyway, so it switches off well before
  // labels do. Also skipped at lowZoom (halos are sub-pixel) and during
  // pan/zoom gestures — zoomed into a cluster each halo covers a large screen
  // area, and gesture-frame snapshot refreshes must fit the frame budget; the
  // crisp settle frame brings the glow back.
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
      const isNeighbor = neighborSet.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isDimmed =
        (hasHover && !isHovered && !isNeighbor) ||
        (isSearchActive && !isSearchMatch);
      if (isDimmed) continue;

      const color = nodeColor(node, theme);
      // Clamp the *glow* radius source (not the node's visual size) so a
      // degree-500 super-hub doesn't paint a screen-filling radial gradient.
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
      grad.addColorStop(
        0,
        color +
          Math.round(intensity * 255)
            .toString(16)
            .padStart(2, "0"),
      );
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nx, ny, glowRadius, 0, TWO_PI);
      ctx.fill();
    }
  }

  // Node shape pass: batched by (color, kind) so we keep O(unique (color,kind))
  // draw calls. Bucket grouping is cached per (nodes, theme) — see nodeBuckets.
  {
    const buckets = nodeBuckets(nodes, theme);
    // When nothing is hovered and no search is active, no node can be dimmed —
    // skip the per-node Set lookups AND the entire second (dimmed) pass.
    const needDimChecks = hasHover || isSearchActive;
    // Below ~2.2 screen pixels a circle/diamond/hexagon is indistinguishable
    // from a square, and rect() is far cheaper than arc() — at 100k nodes this
    // is the difference between a sub-frame and a multi-frame shape pass.
    const tinyShapes = 2.2;
    // World-space length of 4 screen px: keeps nodes visible at extreme
    // zoom-out; sqrt-blend preserves hub/leaf ranking at all zoom levels.
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
            const isHovered = hoveredNodeId === node.id;
            const isNeighbor = neighborSet.has(node.id);
            const isSearchMatch = searchMatchSet.has(node.id);
            const isDimmed =
              (hasHover && !isHovered && !isNeighbor) ||
              (isSearchActive && !isSearchMatch);
            if (isDimmed !== dimPass) continue;
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

  // Connector-logo pass: stamp the sourceType's brand logo inside the circle
  // for memories that came in through a connector sync. Skipped at low zoom
  // and on very large graphs because drawImage per-node is not free.
  //
  // Runs AFTER the batched circle pass so the common case (no logo) never pays
  // any extra cost — the inner loop here only iterates nodes that actually
  // resolve to a connector logo. Clip-to-circle guarantees the logo never
  // bleeds past the node's visual boundary even if the SVG is slightly
  // off-centre.
  if (!lowZoom && !highNodeCount && connectorLogos.size > 0) {
    for (const node of nodes) {
      if (node.kind !== "memory") continue;
      const logo = getConnectorLogo(node.sourceType, connectorLogos);
      if (!logo) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = hoveredNodeId === node.id;
      const isNeighbor = neighborSet.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isDimmed =
        (hasHover && !isHovered && !isNeighbor) ||
        (isSearchActive && !isSearchMatch);

      // Logo sits inset inside the circle so the tag-hash ring remains visible
      // around it — topic colour and provenance read as two distinct signals.
      const logoSize = baseRadius * 1.4;
      const logoHalf = logoSize / 2;

      ctx.save();
      if (isDimmed) ctx.globalAlpha = theme.dimAlpha;
      ctx.beginPath();
      ctx.arc(nx, ny, baseRadius, 0, TWO_PI);
      ctx.clip();
      ctx.drawImage(logo, nx - logoHalf, ny - logoHalf, logoSize, logoSize);
      ctx.restore();
    }
  }

  // Outlines pass: only for hovered/dragged/outlined nodes (few nodes, no batch
  // needed). When the theme draws no resting outlines and nothing is hovered or
  // dragged, the whole O(nodes) scan is skipped.
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

      const isNeighbor = neighborSet.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isDimmed =
        (hasHover && !isHovered && !isNeighbor) ||
        (isSearchActive && !isSearchMatch);
      if (isDimmed) continue;

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
    const focusNode = nodes.find((n) => n.id === focusNodeId);
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

  // --- Edge labels ---
  // Labels only ever draw for the hovered edge / hovered node's edges, so the
  // whole O(edges) scan is skipped while nothing is hovered.
  const hoveredEdgeIdx = hoveredEdgeIndexVisual;
  if (!lowZoom && (hoveredEdgeIdx !== null || hasHoveredNeighbors)) {
    const fontSize = Math.max(8, 10 / Math.max(vp.scale, 0.5));
    ctx.font = `400 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const isHoveredEdge = hoveredEdgeIdx === i;
      const isHoveredNodeEdge =
        hasHoveredNeighbors &&
        neighborSet.has(edge.source.id) &&
        neighborSet.has(edge.target.id);
      if (!isHoveredEdge && !isHoveredNodeEdge) continue;

      const label =
        edge.edgeType === "relates_to"
          ? "relates to"
          : edge.edgeType === "imports"
            ? "imports"
            : edge.edgeType === "wiki_parent"
              ? "parent of"
              : edge.edgeType === "mentions"
                ? "mentions"
                : "tagged";

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

    // Obsidian-style label thinning: only caption a node big enough on screen
    // to read. As you zoom out, nodes shrink below this and their labels drop
    // away (biggest hubs persist longest); zooming in fades them back in. This
    // is also the dominant render-cost lever — at a dense zoom-out the label
    // pass (fillText + measureText per node) otherwise costs more than the
    // entire rest of the frame. The hovered node always shows its caption;
    // neighbours use a lenient half-threshold (see below).
    const minLabelScreenR = 6;

    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;

      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = hoveredNodeId === node.id;
      const isNeighbor = neighborSet.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isDimmed =
        (hasHover && !isHovered && !isNeighbor) ||
        (isSearchActive && !isSearchMatch);

      if (isDimmed) continue;

      // Neighbour labels get a lenient gate (half the resting threshold):
      // hover should reveal the neighbourhood, but captioning sub-3px dots in
      // a dense cluster just stacks unreadable text — Obsidian likewise only
      // labels neighbours you could actually read at the current zoom.
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
    const sourceNode = nodes.find((n) => n.id === interaction.linkSourceId);
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
        const target = nodes.find((n) => n.id === interaction.hoveredNodeId);
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
