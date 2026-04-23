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

function nodeColor(node: GraphNode, theme: GraphViewTheme): string {
  return getNodeColor(
    node.tags,
    node.kind,
    theme.isDarkCanvas,
    theme.nodeColorOverride,
  );
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
  showLabels: boolean,
  connectorLogos: ConnectorLogoMap,
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
  const hasHover = interaction.hoveredNodeId !== null;
  // Edges only enter hover mode (dim non-connected, highlight connected) when
  // the hovered node actually has neighbors. Hovering an isolated node would
  // otherwise fade the entire graph to gray with nothing to highlight.
  // neighborSet always includes the hovered node itself, so size > 1 means
  // there's at least one real neighbor.
  const hasHoveredNeighbors = hasHover && neighborSet.size > 1;
  const isSearchActive = searchMatchSet.size > 0;
  const lowZoom = vp.scale < 0.4;
  const veryLowZoom = vp.scale < 0.08;
  const highNodeCount = nodeCount > 5000;

  // --- Edges (batched by style — single beginPath/stroke per style bucket) ---
  // Skip ALL edges at very low zoom (just render node dots)
  if (!veryLowZoom && edges.length > 0) {
    // Edge budget: skip tag edges when total edge count is very high
    const skipTagEdges = edges.length > 10_000;

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
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        }
        ctx.stroke();
      }

      // relates_to + imports — same hue ("user-forged" warm).
      ctx.strokeStyle = theme.edge.normalByType.relates_to;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.beginPath();
      for (const edge of edges) {
        if (edge.edgeType !== "relates_to" && edge.edgeType !== "imports")
          continue;
        ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
        ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
      }
      ctx.stroke();

      // wiki_parent — structural cool hue.
      ctx.strokeStyle = theme.edge.normalByType.wiki_parent;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.beginPath();
      for (const edge of edges) {
        if (edge.edgeType !== "wiki_parent") continue;
        ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
        ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
      }
      ctx.stroke();
    } else {
      // Hover active — two batched passes per edge type: dimmed non-connected
      // edges first (fade into background), then connected edges on top at
      // full opacity so the hover highlight reads as a clear "lit up" line.
      for (const edgeType of [
        "tag",
        "relates_to",
        "imports",
        "wiki_parent",
      ] as const) {
        if (edgeType === "tag" && skipTagEdges) continue;
        const isStrongEdge =
          edgeType === "relates_to" ||
          edgeType === "imports" ||
          edgeType === "wiki_parent";
        const widthMultiplier = isStrongEdge ? 2 : 1;
        // `imports` reuses the relates_to palette slot (both are user-linked).
        const typeColor =
          edgeType === "imports"
            ? theme.edge.normalByType.relates_to
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
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
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
    const hoveredEdgeIdx = interaction.hoveredEdgeIndex;
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
  // Glow pass: skip when highNodeCount or lowZoom (expensive per-node radial gradient)
  if (theme.glow.enabled && !lowZoom && !highNodeCount) {
    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = interaction.hoveredNodeId === node.id;
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
  // draw calls. With only 4 kinds today the extra cardinality is negligible,
  // and it lets us stamp circles / squares / diamonds / hexagons in one path each.
  {
    const buckets = new Map<
      string,
      { color: string; kind: GraphNodeKind; nodes: GraphNode[] }
    >();
    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!lowZoom && !isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH))
        continue;
      const color = nodeColor(node, theme);
      const key = `${node.kind}|${color}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.nodes.push(node);
      else buckets.set(key, { color, kind: node.kind, nodes: [node] });
    }

    // Draw non-dimmed nodes first, then dimmed nodes at reduced alpha
    for (const dimPass of [false, true]) {
      if (dimPass) ctx.globalAlpha = theme.dimAlpha;

      for (const { color, kind, nodes: bucket } of buckets.values()) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const node of bucket) {
          const isHovered = interaction.hoveredNodeId === node.id;
          const isNeighbor = neighborSet.has(node.id);
          const isSearchMatch = searchMatchSet.has(node.id);
          const isDimmed =
            (hasHover && !isHovered && !isNeighbor) ||
            (isSearchActive && !isSearchMatch);
          if (isDimmed !== dimPass) continue;

          const nx = node.x ?? 0;
          const ny = node.y ?? 0;
          const baseRadius = node.size * 2;
          // Keep nodes visible at extreme zoom-out. minWorld is the world-space
          // length of 4 screen pixels; sqrt-blend preserves hub/leaf ranking at
          // all zoom levels.
          const minWorld = 4 / vp.scale;
          const radius = Math.sqrt(
            baseRadius * baseRadius + minWorld * minWorld,
          );
          traceShape(ctx, kind, nx, ny, radius);
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

      const isHovered = interaction.hoveredNodeId === node.id;
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

  // Outlines pass: only for hovered/dragged/outlined nodes (few nodes, no batch needed)
  if (!lowZoom) {
    for (const node of nodes) {
      const isHovered = interaction.hoveredNodeId === node.id;
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

  // --- Edge label (only on the hovered edge) ---
  // Obsidian's graph view doesn't annotate every line — it would drown the
  // canvas. We only stamp the relationship category on the edge the user is
  // currently pointing at, so the label becomes a targeted affordance instead
  // of ambient noise.
  if (!lowZoom) {
    const hoveredEdgeIdx = interaction.hoveredEdgeIndex;
    if (hoveredEdgeIdx !== null && hoveredEdgeIdx < edges.length) {
      const edge = edges[hoveredEdgeIdx];
      const label =
        edge.edgeType === "relates_to"
          ? "relates to"
          : edge.edgeType === "imports"
            ? "imports"
            : edge.edgeType === "wiki_parent"
              ? "parent of"
              : "tagged";

      const fontSize = Math.max(8, 10 / Math.max(vp.scale, 0.5));
      ctx.font = `400 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

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

      ctx.fillStyle = theme.label.color;
      ctx.fillText(label, mx, my);
    }
  }

  // --- Node labels: skip when toggled off, at high node count, or very low zoom ---
  if (showLabels && !lowZoom && !highNodeCount) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const fontSize = Math.max(10, 12 / Math.max(vp.scale, 0.5));
    ctx.font = `500 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;

    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;

      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = interaction.hoveredNodeId === node.id;
      const isNeighbor = neighborSet.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isDimmed =
        (hasHover && !isHovered && !isNeighbor) ||
        (isSearchActive && !isSearchMatch);

      if (isDimmed) continue;

      const showLabel = !hasHover || isHovered || isNeighbor;
      if (!showLabel) continue;

      ctx.fillStyle = isHovered ? theme.label.color : theme.label.secondary;
      ctx.fillText(node.title, nx, ny + baseRadius + 4, 150);
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
