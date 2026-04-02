import type {
  GraphNode,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "./types";
import type { GraphViewTheme } from "../graph-view-themes";

const TWO_PI = Math.PI * 2;
const HEX_ANGLE_OFFSET = Math.PI / 6;

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = HEX_ANGLE_OFFSET + (TWO_PI / 6) * i;
    const hx = x + radius * Math.cos(angle);
    const hy = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
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

  const hasHover = interaction.hoveredNodeId !== null;
  const lowZoom = vp.scale < 0.4;

  // --- Edges ---
  const tagEdges: ResolvedEdge[] = [];
  const relatesToEdges: ResolvedEdge[] = [];
  for (const edge of edges) {
    if (edge.edgeType === "relates_to") relatesToEdges.push(edge);
    else tagEdges.push(edge);
  }

  // Tag edges (dimmer, thinner)
  if (tagEdges.length > 0) {
    for (const edge of tagEdges) {
      const sx = edge.source.x ?? 0;
      const sy = edge.source.y ?? 0;
      const tx = edge.target.x ?? 0;
      const ty = edge.target.y ?? 0;

      const isConnected =
        hasHover &&
        neighborSet.has(edge.source.id) &&
        neighborSet.has(edge.target.id);
      const isDimmed = hasHover && !isConnected;

      ctx.strokeStyle = isDimmed
        ? theme.edge.dimmed
        : isConnected
          ? theme.edge.connected
          : theme.edge.normal;
      ctx.lineWidth = isConnected
        ? theme.edge.connectedWidth
        : theme.edge.width;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  // Relates_to edges (brighter, thicker)
  if (relatesToEdges.length > 0) {
    for (const edge of relatesToEdges) {
      const sx = edge.source.x ?? 0;
      const sy = edge.source.y ?? 0;
      const tx = edge.target.x ?? 0;
      const ty = edge.target.y ?? 0;

      const isConnected =
        hasHover &&
        neighborSet.has(edge.source.id) &&
        neighborSet.has(edge.target.id);
      const isDimmed = hasHover && !isConnected;

      ctx.strokeStyle = isDimmed
        ? theme.edge.dimmed
        : isConnected
          ? theme.edge.connected
          : theme.edge.normal;
      ctx.lineWidth =
        (isConnected ? theme.edge.connectedWidth : theme.edge.width) * 2;
      ctx.globalAlpha = isDimmed ? theme.dimAlpha : 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // --- Nodes ---
  for (const node of nodes) {
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const baseRadius = node.size * 3;

    if (!lowZoom && !isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH))
      continue;

    const isHovered = interaction.hoveredNodeId === node.id;
    const isDragged = interaction.draggedNodeId === node.id;
    const isNeighbor = neighborSet.has(node.id);
    const isDimmed = hasHover && !isHovered && !isNeighbor;

    if (isDimmed) {
      ctx.globalAlpha = theme.dimAlpha;
    }

    const color = theme.nodeColorOverride ?? node.color;

    // Glow effect
    if (theme.glow.enabled && !isDimmed) {
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

    // Node shape
    if (lowZoom) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nx, ny, Math.max(2, baseRadius * 0.5), 0, TWO_PI);
      ctx.fill();
    } else {
      // Hexagon
      ctx.fillStyle = color;
      drawHexagon(ctx, nx, ny, baseRadius);
      ctx.fill();

      // Outline
      if (theme.outline.enabled || isHovered || isDragged) {
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
        drawHexagon(ctx, nx, ny, baseRadius + outlineWidth);
        ctx.stroke();
      }
    }

    if (isDimmed) {
      ctx.globalAlpha = 1;
    }
  }

  // --- Labels ---
  if (!lowZoom) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const fontSize = Math.max(10, 12 / Math.max(vp.scale, 0.5));
    ctx.font = `500 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;

    for (const node of nodes) {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const baseRadius = node.size * 3;

      if (!isOnScreen(nx, ny, baseRadius, vp, canvasW, canvasH)) continue;

      const isHovered = interaction.hoveredNodeId === node.id;
      const isNeighbor = neighborSet.has(node.id);
      const isDimmed = hasHover && !isHovered && !isNeighbor;

      if (isDimmed) continue;

      const showLabel = !hasHover || isHovered || isNeighbor;
      if (!showLabel) continue;

      ctx.fillStyle = isHovered ? theme.label.color : theme.label.secondary;
      ctx.fillText(node.title, nx, ny + baseRadius + 6, 150);
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
          ctx.arc(tx, ty, target.size * 3 * vp.scale + 8, 0, TWO_PI);
          ctx.stroke();
        }
      }
    }
  }
}
