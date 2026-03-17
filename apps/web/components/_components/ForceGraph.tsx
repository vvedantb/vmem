"use client";

import { useEffect, useRef, useCallback } from "react";
import { Button } from "@vmem/ui";
import { IconZoomIn, IconZoomOut, IconFocus2 } from "@tabler/icons-react";
import type Graph from "graphology";
import type { SimNode, SimEdge, HoveredNodeInfo } from "./graph-types";
import {
  createLayoutGraph,
  runInitialLayout,
  applyDrift,
  renderGraph,
} from "./graph-physics";

interface ForceGraphProps {
  nodes: SimNode[];
  edges: SimEdge[];
  isDark: boolean;
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface DragState {
  nodeIndex: number | null;
  panning: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  w: number,
  h: number,
): [number, number] {
  return [(wx - cam.x) * cam.zoom + w / 2, (wy - cam.y) * cam.zoom + h / 2];
}

function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  w: number,
  h: number,
): [number, number] {
  return [(sx - w / 2) / cam.zoom + cam.x, (sy - h / 2) / cam.zoom + cam.y];
}

function findNodeAtScreen(
  nodes: SimNode[],
  sx: number,
  sy: number,
  cam: Camera,
  w: number,
  h: number,
): number | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const [nx, ny] = worldToScreen(nodes[i].x, nodes[i].y, cam, w, h);
    const dx = sx - nx;
    const dy = sy - ny;
    const hitRadius = Math.max(nodes[i].radius * 2, 8);
    if (dx * dx + dy * dy < hitRadius * hitRadius) return i;
  }
  return null;
}

const emptyDrag: DragState = {
  nodeIndex: null,
  panning: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
};

export default function ForceGraph({
  nodes,
  edges,
  isDark,
  onHoverNode,
  onClickNode,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<DragState>({ ...emptyDrag });
  const hoveredRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const graphRef = useRef<Graph | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const cbRef = useRef({ onHoverNode, onClickNode });
  const isDarkRef = useRef(isDark);

  nodesRef.current = nodes;
  edgesRef.current = edges;
  cbRef.current = { onHoverNode, onClickNode };
  isDarkRef.current = isDark;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { w: rect.width, h: rect.height };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const loop = () => {
      const n = nodesRef.current;
      const e = edgesRef.current;
      const cam = cameraRef.current;
      const drag = dragRef.current;
      const { w, h } = sizeRef.current;

      if (drag.nodeIndex !== null) {
        const [wx, wy] = screenToWorld(drag.lastX, drag.lastY, cam, w, h);
        n[drag.nodeIndex].x = wx;
        n[drag.nodeIndex].y = wy;
        n[drag.nodeIndex].vx = 0;
        n[drag.nodeIndex].vy = 0;
      }

      applyDrift(n, performance.now(), drag.nodeIndex);

      const connectedSet = new Set<number>();
      const hIdx = hoveredRef.current;
      if (hIdx !== null) {
        connectedSet.add(hIdx);
        for (const edge of e) {
          if (edge.sourceIndex === hIdx) connectedSet.add(edge.targetIndex);
          if (edge.targetIndex === hIdx) connectedSet.add(edge.sourceIndex);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.scale(dpr, dpr);
      renderGraph(ctx, n, e, w, h, cam, hIdx, connectedSet, isDarkRef.current);
      ctx.restore();

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cam = cameraRef.current;
      const { w, h } = sizeRef.current;
      const [wx, wy] = screenToWorld(sx, sy, cam, w, h);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      cam.zoom = Math.max(0.1, Math.min(10, cam.zoom * factor));
      cam.x = wx - (sx - w / 2) / cam.zoom;
      cam.y = wy - (sy - h / 2) / cam.zoom;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    if (nodes.length === 0) {
      graphRef.current = null;
      return;
    }
    const graph = createLayoutGraph(nodes, edges);
    runInitialLayout(graph, nodes);
    graphRef.current = graph;
  }, [nodes, edges]);

  const getPos = useCallback((e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [e.clientX - rect.left, e.clientY - rect.top];
  }, []);

  const updateHover = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    const { w, h } = sizeRef.current;
    const idx = findNodeAtScreen(nodesRef.current, sx, sy, cam, w, h);
    if (idx !== hoveredRef.current) {
      hoveredRef.current = idx;
      if (idx !== null) {
        const node = nodesRef.current[idx];
        const [vx, vy] = worldToScreen(node.x, node.y, cam, w, h);
        cbRef.current.onHoverNode({
          id: node.id,
          title: node.label,
          content: node.content,
          viewportX: vx,
          viewportY: vy,
        });
      } else {
        cbRef.current.onHoverNode(null);
      }
    }
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const [sx, sy] = getPos(e);
      const cam = cameraRef.current;
      const { w, h } = sizeRef.current;
      const idx = findNodeAtScreen(nodesRef.current, sx, sy, cam, w, h);
      dragRef.current = {
        nodeIndex: idx,
        panning: idx === null,
        startX: sx,
        startY: sy,
        lastX: sx,
        lastY: sy,
        moved: false,
      };
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "grabbing";
    },
    [getPos],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const [sx, sy] = getPos(e);
      const drag = dragRef.current;
      const cam = cameraRef.current;

      if (drag.nodeIndex !== null || drag.panning) {
        if (Math.abs(sx - drag.startX) > 3 || Math.abs(sy - drag.startY) > 3) {
          drag.moved = true;
        }
        if (drag.panning) {
          cam.x -= (sx - drag.lastX) / cam.zoom;
          cam.y -= (sy - drag.lastY) / cam.zoom;
        }
        drag.lastX = sx;
        drag.lastY = sy;
      }

      updateHover(sx, sy);

      const canvas = canvasRef.current;
      if (canvas) {
        if (drag.nodeIndex !== null || drag.panning) {
          canvas.style.cursor = "grabbing";
        } else if (hoveredRef.current !== null) {
          canvas.style.cursor = "pointer";
        } else {
          canvas.style.cursor = "default";
        }
      }
    },
    [getPos, updateHover],
  );

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag.moved && drag.nodeIndex !== null) {
      cbRef.current.onClickNode(nodesRef.current[drag.nodeIndex].id);
    }
    dragRef.current = { ...emptyDrag };
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = hoveredRef.current !== null ? "pointer" : "default";
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    dragRef.current = { ...emptyDrag };
    hoveredRef.current = null;
    cbRef.current.onHoverNode(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "default";
  }, []);

  const zoomIn = useCallback(() => {
    cameraRef.current.zoom = Math.min(10, cameraRef.current.zoom * 1.4);
  }, []);
  const zoomOut = useCallback(() => {
    cameraRef.current.zoom = Math.max(0.1, cameraRef.current.zoom / 1.4);
  }, []);
  const resetCam = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 overflow-hidden rounded-xl"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={zoomIn}
          className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconZoomIn size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={zoomOut}
          className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconZoomOut size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={resetCam}
          className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconFocus2 size={14} />
        </Button>
      </div>

      <div className="absolute bottom-3 left-3 text-[11px] text-muted-foreground/40 pointer-events-none select-none">
        {nodes.length} nodes &middot; {edges.length} edges
      </div>
    </div>
  );
}
