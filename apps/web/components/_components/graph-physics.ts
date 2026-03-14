import type { SimNode, SimEdge } from "./graph-types";

export interface SimParams {
  repulsion: number;
  attraction: number;
  springLength: number;
  damping: number;
  centerGravity: number;
  maxSpeed: number;
}

export const defaultParams: SimParams = {
  repulsion: 1200,
  attraction: 0.008,
  springLength: 100,
  damping: 0.82,
  centerGravity: 0.03,
  maxSpeed: 8,
};

export function simulationTick(
  nodes: SimNode[],
  edges: SimEdge[],
  params: SimParams,
  pinnedIndex: number | null,
): void {
  const len = nodes.length;

  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const distSq = dx * dx + dy * dy + 1;
      const force = params.repulsion / distSq;
      const dist = Math.sqrt(distSq);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }

  for (const edge of edges) {
    const s = nodes[edge.sourceIndex];
    const t = nodes[edge.targetIndex];
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
    const displacement = dist - params.springLength;
    const force = params.attraction * displacement * edge.weight;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  for (let i = 0; i < len; i++) {
    if (i === pinnedIndex) continue;
    const node = nodes[i];
    node.vx -= node.x * params.centerGravity;
    node.vy -= node.y * params.centerGravity;
    node.vx *= params.damping;
    node.vy *= params.damping;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > params.maxSpeed) {
      node.vx = (node.vx / speed) * params.maxSpeed;
      node.vy = (node.vy / speed) * params.maxSpeed;
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

export function renderGraph(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number,
  camera: Camera,
  hoveredIndex: number | null,
  connectedSet: Set<number>,
  isDark: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = isDark ? "#08080c" : "#f5f5f8";
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.5,
  );
  grad.addColorStop(
    0,
    isDark ? "rgba(80, 70, 180, 0.04)" : "rgba(80, 80, 180, 0.03)",
  );
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const hasHover = hoveredIndex !== null;
  const invZoom = 1 / camera.zoom;

  for (const edge of edges) {
    const s = nodes[edge.sourceIndex];
    const t = nodes[edge.targetIndex];
    const connected =
      hasHover &&
      connectedSet.has(edge.sourceIndex) &&
      connectedSet.has(edge.targetIndex);
    const dimmed = hasHover && !connected;

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);

    if (isDark) {
      ctx.strokeStyle = dimmed
        ? "rgba(255,255,255,0.015)"
        : connected
          ? "rgba(255,255,255,0.14)"
          : "rgba(255,255,255,0.04)";
    } else {
      ctx.strokeStyle = dimmed
        ? "rgba(0,0,0,0.015)"
        : connected
          ? "rgba(0,0,0,0.14)"
          : "rgba(0,0,0,0.06)";
    }
    ctx.lineWidth = (connected ? 1.2 : 0.5) * invZoom;
    ctx.stroke();
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isHovered = i === hoveredIndex;
    const isConnected = connectedSet.has(i);
    const dimmed = hasHover && !isConnected;
    const r = (isHovered ? node.radius * 1.5 : node.radius) * invZoom;

    if (isDark && !dimmed) {
      ctx.shadowBlur = (isHovered ? 24 : 10) * invZoom;
      ctx.shadowColor = node.color;
    }

    ctx.globalAlpha = dimmed ? 0.08 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();

    if (!isDark && !dimmed) {
      ctx.strokeStyle = isHovered ? node.color : "rgba(0,0,0,0.12)";
      ctx.lineWidth = (isHovered ? 1.5 : 0.5) * invZoom;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  if (hasHover) {
    const fontSize = Math.max(10, 12 * invZoom);
    ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const idx of connectedSet) {
      const node = nodes[idx];
      const isHov = idx === hoveredIndex;
      ctx.fillStyle = isDark
        ? isHov
          ? "#ffffff"
          : "rgba(255,255,255,0.6)"
        : isHov
          ? "#111111"
          : "rgba(0,0,0,0.5)";
      const offset = (node.radius + 6) * invZoom;
      ctx.fillText(node.label, node.x, node.y + offset);
    }
  } else if (camera.zoom > 1.8) {
    const fontSize = Math.max(9, 10 * invZoom);
    ctx.font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";
    for (const node of nodes) {
      const offset = (node.radius + 5) * invZoom;
      ctx.fillText(node.label, node.x, node.y + offset);
    }
  }

  ctx.restore();
}
