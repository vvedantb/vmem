import type { Graph } from "@cosmos.gl/graph";
import type { GraphNode } from "@/lib/graph/types";
import { nodeColor as getNodeColor } from "../graph-colors";
import type { GraphViewTheme } from "../graph-view-themes";
import type { CosmosGraphBuffers } from "./cosmos-adapters";
import { COSMOS_LOW_ZOOM_THRESHOLD } from "./cosmos-labels";

const GLOW_NODE_BUDGET = 1500;
const TWO_PI = Math.PI * 2;

export interface PaintCosmosGlowInput {
  canvas: HTMLCanvasElement;
  root: HTMLDivElement;
  graph: Graph;
  buffers: CosmosGraphBuffers;
  theme: GraphViewTheme;
  hoveredPointIndex?: number;
  gestureActive: boolean;
  isPointDimmed: (index: number) => boolean;
}

export function shouldPaintCosmosGlow(
  theme: GraphViewTheme,
  nodeCount: number,
  zoom: number,
  gestureActive: boolean,
): boolean {
  return (
    theme.glow.enabled &&
    !gestureActive &&
    zoom >= COSMOS_LOW_ZOOM_THRESHOLD &&
    nodeCount <= GLOW_NODE_BUDGET
  );
}

function nodeGlowColor(node: GraphNode, theme: GraphViewTheme): string {
  return getNodeColor(
    node.tags,
    node.kind,
    theme.isDarkCanvas,
    theme.nodeColorOverride,
  );
}

/** Dark-theme radial glow pass on a 2D canvas under the WebGL host. */
export function paintCosmosGlow(input: PaintCosmosGlowInput): void {
  const {
    canvas,
    root,
    graph,
    buffers,
    theme,
    hoveredPointIndex,
    gestureActive,
    isPointDimmed,
  } = input;

  const zoom = graph.getZoomLevel();
  if (
    !shouldPaintCosmosGlow(
      theme,
      buffers.indexToNode.length,
      zoom,
      gestureActive,
    )
  ) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const w = root.clientWidth;
  const h = root.clientHeight;
  if (w === 0 || h === 0) return;

  if (
    canvas.width !== Math.floor(w * dpr) ||
    canvas.height !== Math.floor(h * dpr)
  ) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const positions = graph.getPointPositions();
  for (let i = 0; i < buffers.indexToNode.length; i++) {
    if (isPointDimmed(i)) continue;
    const node = buffers.indexToNode[i];
    if (!node) continue;

    const px = positions[i * 2];
    const py = positions[i * 2 + 1];
    if (px === undefined || py === undefined) continue;
    const [sx, sy] = graph.spaceToScreenPosition([px, py]);

    const isHovered = hoveredPointIndex === i;
    const glowR = Math.min(node.size, 10) * 2 * zoom;
    const glowRadius = glowR * theme.glow.radiusMultiplier;
    const intensity = isHovered
      ? theme.glow.hoveredIntensity
      : theme.glow.intensity;

    const grad = ctx.createRadialGradient(
      sx,
      sy,
      glowR * 0.5,
      sx,
      sy,
      glowRadius,
    );
    grad.addColorStop(0, nodeGlowColor(node, theme));
    grad.addColorStop(1, "transparent");
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, glowRadius, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}
