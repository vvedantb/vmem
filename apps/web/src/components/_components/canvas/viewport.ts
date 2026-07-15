import type { ViewportState } from "@/lib/graph/types";

// low enough that fitToNodes can frame a 100k-node layout (world extent grows with
const MIN_SCALE = 0.01;
const MAX_SCALE = 5.0;
const FRICTION = 0.92;
// zoom/pan spring response
const SPRING_FACTOR = 0.35;
const VELOCITY_THRESHOLD = 0.5;

export function createViewport(): ViewportState {
  return {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    targetScale: 1,
    targetOffsetX: 0,
    targetOffsetY: 0,
    velocityX: 0,
    velocityY: 0,
  };
}

export function tickViewport(vp: ViewportState): void {
  if (
    Math.abs(vp.velocityX) > VELOCITY_THRESHOLD ||
    Math.abs(vp.velocityY) > VELOCITY_THRESHOLD
  ) {
    vp.offsetX += vp.velocityX;
    vp.offsetY += vp.velocityY;
    vp.targetOffsetX = vp.offsetX;
    vp.targetOffsetY = vp.offsetY;
    vp.velocityX *= FRICTION;
    vp.velocityY *= FRICTION;
  } else {
    vp.velocityX = 0;
    vp.velocityY = 0;
  }

  const dScale = vp.targetScale - vp.scale;
  if (Math.abs(dScale) > 0.001) {
    vp.scale += dScale * SPRING_FACTOR;
  } else {
    vp.scale = vp.targetScale;
  }

  const dOffX = vp.targetOffsetX - vp.offsetX;
  const dOffY = vp.targetOffsetY - vp.offsetY;
  if (Math.abs(dOffX) > 0.5 || Math.abs(dOffY) > 0.5) {
    vp.offsetX += dOffX * SPRING_FACTOR;
    vp.offsetY += dOffY * SPRING_FACTOR;
  } else {
    vp.offsetX = vp.targetOffsetX;
    vp.offsetY = vp.targetOffsetY;
  }
}

export function zoomAt(
  vp: ViewportState,
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
  factor: number,
): void {
  const newScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, vp.targetScale * factor),
  );

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const worldX = (screenX - cx - vp.offsetX) / vp.scale;
  const worldY = (screenY - cy - vp.offsetY) / vp.scale;

  vp.targetScale = newScale;
  vp.targetOffsetX = screenX - cx - worldX * newScale;
  vp.targetOffsetY = screenY - cy - worldY * newScale;
  vp.velocityX = 0;
  vp.velocityY = 0;
}

export function fitToNodes(
  vp: ViewportState,
  nodes: { x?: number; y?: number }[],
  canvasW: number,
  canvasH: number,
  padding: number = 80,
): void {
  if (nodes.length === 0) return;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    const nx = n.x ?? 0;
    const ny = n.y ?? 0;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny;
    if (ny > maxY) maxY = ny;
  }

  const graphW = maxX - minX || 1;
  const graphH = maxY - minY || 1;
  const scaleX = (canvasW - padding * 2) / graphW;
  const scaleY = (canvasH - padding * 2) / graphH;
  const scale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, Math.min(scaleX, scaleY)),
  );

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  vp.targetScale = scale;
  vp.targetOffsetX = -centerX * scale;
  vp.targetOffsetY = -centerY * scale;
  vp.velocityX = 0;
  vp.velocityY = 0;
}

export function screenToWorld(
  vp: ViewportState,
  screenX: number,
  screenY: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return {
    x: (screenX - canvasW / 2 - vp.offsetX) / vp.scale,
    y: (screenY - canvasH / 2 - vp.offsetY) / vp.scale,
  };
}
