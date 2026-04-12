import type {
  GraphNode,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "./types";
import type { GraphViewTheme } from "../graph-view-themes";
import { nodeColor as getNodeColor } from "../graph-colors";

const TWO_PI = Math.PI * 2;

function nodeColor(node: GraphNode, theme: GraphViewTheme): string {
  return getNodeColor(node.tags, theme.isDarkCanvas, theme.nodeColorOverride);
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
): void {
  const w = canvasW * dpr;
  const h = canvasH * dpr;

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
  const isSearchActive = searchMatchSet.size > 0;
  const lowZoom = vp.scale < 0.4;
  const veryLowZoom = vp.scale < 0.15;
  const highNodeCount = nodeCount > 5000;

  // --- Edges (batched by style — single beginPath/stroke per style bucket) ---
  // Skip ALL edges at very low zoom (just render node dots)
  if (!veryLowZoom && edges.length > 0) {
    // Edge budget: skip tag edges when total edge count is very high
    const skipTagEdges = edges.length > 10_000;

    if (!hasHover) {
      // No hover — all edges same alpha. Two batched passes: tag edges, relates_to edges.
      // Tag edges (dimmer, thinner)
      if (!skipTagEdges) {
        ctx.strokeStyle = theme.edge.normal;
        ctx.lineWidth = theme.edge.width;
        ctx.beginPath();
        for (const edge of edges) {
          if (edge.edgeType !== "tag") continue;
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        }
        ctx.stroke();
      }

      // Relates_to + imports edges (brighter, thicker)
      ctx.strokeStyle = theme.edge.normal;
      ctx.lineWidth = theme.edge.width * 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (const edge of edges) {
        if (edge.edgeType !== "relates_to" && edge.edgeType !== "imports")
          continue;
        ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
        ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // Hover active — batch into 3 style buckets per edge type: dimmed, normal, connected.
      // Draw dimmed first (bottom), then normal, then connected (top).
      for (const edgeType of ["tag", "relates_to", "imports"] as const) {
        if (edgeType === "tag" && skipTagEdges) continue;
        const isStrongEdge =
          edgeType === "relates_to" || edgeType === "imports";
        const widthMultiplier = isStrongEdge ? 2 : 1;
        const baseAlpha = isStrongEdge ? 0.6 : 1;

        // Pass 1: dimmed edges
        ctx.strokeStyle = theme.edge.dimmed;
        ctx.lineWidth = theme.edge.width * widthMultiplier;
        ctx.globalAlpha = isStrongEdge ? theme.dimAlpha : 1;
        ctx.beginPath();
        for (const edge of edges) {
          if (edge.edgeType !== edgeType) continue;
          const isConnected =
            neighborSet.has(edge.source.id) && neighborSet.has(edge.target.id);
          if (isConnected) continue; // skip non-dimmed
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        }
        ctx.stroke();

        // Pass 2: connected edges (on top)
        ctx.strokeStyle = theme.edge.connected;
        ctx.lineWidth = theme.edge.connectedWidth * widthMultiplier;
        ctx.globalAlpha = baseAlpha;
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
        ctx.globalAlpha = 1;
      }
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
      const glowRadius = baseRadius * theme.glow.radiusMultiplier;
      const intensity = isHovered
        ? theme.glow.hoveredIntensity
        : theme.glow.intensity;
      const grad = ctx.createRadialGradient(
        nx,
        ny,
        baseRadius * 0.5,
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

  // Node circles pass: batched by color to reduce draw calls from O(n) to O(unique colors)
  {
    // Build color buckets
    const colorBuckets = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 2;
      if (!lowZoom && !isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH))
        continue;
      const color = nodeColor(node, theme);
      const bucket = colorBuckets.get(color);
      if (bucket) bucket.push(node);
      else colorBuckets.set(color, [node]);
    }

    // Draw non-dimmed nodes first, then dimmed nodes at reduced alpha
    for (const dimPass of [false, true]) {
      if (dimPass) ctx.globalAlpha = theme.dimAlpha;

      for (const [color, bucket] of colorBuckets) {
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
          const radius = lowZoom ? Math.max(2, baseRadius * 0.5) : baseRadius;
          ctx.moveTo(nx + radius, ny);
          ctx.arc(nx, ny, radius, 0, TWO_PI);
        }
        ctx.fill();
      }

      if (dimPass) ctx.globalAlpha = 1;
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
      ctx.arc(nx, ny, baseRadius + outlineWidth, 0, TWO_PI);
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

  // --- Edge labels (only on hovered node's edges — always safe even at high node counts) ---
  if (!lowZoom && hasHover) {
    const fontSize = Math.max(8, 10 / Math.max(vp.scale, 0.5));
    ctx.font = `400 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const edge of edges) {
      const sId = edge.source.id;
      const tId = edge.target.id;
      if (
        sId !== interaction.hoveredNodeId &&
        tId !== interaction.hoveredNodeId
      )
        continue;
      if (!edge.reason) continue;

      const mx = ((edge.source.x ?? 0) + (edge.target.x ?? 0)) / 2;
      const my = ((edge.source.y ?? 0) + (edge.target.y ?? 0)) / 2;

      const label =
        edge.reason.length > 30
          ? edge.reason.slice(0, 28) + "..."
          : edge.reason;
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
