"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  IconZoomIn,
  IconZoomOut,
  IconFocusCentered,
} from "@tabler/icons-react";
import type {
  GraphNode,
  GraphEdge,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "./canvas/types";
import type { SimulationController } from "./canvas/simulation";
import { createSimulation } from "./canvas/simulation";
import {
  createViewport,
  tickViewport,
  fitToNodes,
  zoomAt,
} from "./canvas/viewport";
import { createSpatialIndex, rebuildIndex, markDirty } from "./canvas/hit-test";
import { render } from "./canvas/renderer";
import { attachInputHandlers } from "./canvas/input-handler";
import type { GraphViewTheme } from "./graph-view-themes";
import type { GraphSettings } from "./graph-types";
import type { HoveredNodeInfo } from "./graph-types";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewTheme: GraphViewTheme;
  settings: GraphSettings;
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
  onLinkNodes: (sourceId: string, targetId: string) => void;
}

export default function GraphCanvas({
  nodes,
  edges,
  viewTheme,
  settings,
  onHoverNode,
  onClickNode,
  onLinkNodes,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const themeRef = useRef(viewTheme);
  const settingsRef = useRef(settings);
  const callbacksRef = useRef({ onHoverNode, onClickNode, onLinkNodes });

  const simRef = useRef<SimulationController | null>(null);
  const viewportRef = useRef<ViewportState>(createViewport());
  const interactionRef = useRef<InteractionState>({
    hoveredNodeId: null,
    draggedNodeId: null,
    linkSourceId: null,
    isPanning: false,
    mouseWorldX: 0,
    mouseWorldY: 0,
    shiftHeld: false,
  });
  const spatialIndexRef = useRef(createSpatialIndex());
  const hasFittedRef = useRef(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;
  themeRef.current = viewTheme;
  callbacksRef.current = { onHoverNode, onClickNode, onLinkNodes };

  useEffect(() => {
    if (simRef.current) {
      simRef.current.setStrength(settings.scalingRatio);
      simRef.current.setGravity(settings.gravity);
    }
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (!maybeCanvas || nodes.length === 0) return;

    const maybeCtx = maybeCanvas.getContext("2d");
    if (!maybeCtx) return;

    const canvas: HTMLCanvasElement = maybeCanvas;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const sim = createSimulation(
      nodes,
      edges,
      settingsRef.current.scalingRatio,
      settingsRef.current.gravity,
    );
    simRef.current = sim;

    const cleanup = attachInputHandlers(
      canvas,
      interactionRef.current,
      viewportRef.current,
      simRef,
      spatialIndexRef,
      {
        onHoverNode(node) {
          if (node) {
            const vp = viewportRef.current;
            const sx =
              (node.x ?? 0) * vp.scale + vp.offsetX + canvas.clientWidth / 2;
            const sy =
              (node.y ?? 0) * vp.scale + vp.offsetY + canvas.clientHeight / 2;
            callbacksRef.current.onHoverNode({
              id: node.id,
              title: node.title,
              content: node.content,
              viewportX: sx,
              viewportY: sy,
            });
          } else {
            callbacksRef.current.onHoverNode(null);
          }
        },
        onClickNode(nodeId) {
          callbacksRef.current.onClickNode(nodeId);
        },
        onLinkNodes(sourceId, targetId) {
          callbacksRef.current.onLinkNodes(sourceId, targetId);
        },
      },
    );

    let rafId: number;

    const neighborMap = new Map<string, Set<string>>();
    function buildNeighborMap() {
      neighborMap.clear();
      for (const edge of edgesRef.current) {
        const sId =
          typeof edge.source === "string" ? edge.source : edge.source.id;
        const tId =
          typeof edge.target === "string" ? edge.target : edge.target.id;
        let sSet = neighborMap.get(sId);
        if (!sSet) {
          sSet = new Set();
          neighborMap.set(sId, sSet);
        }
        sSet.add(tId);
        let tSet = neighborMap.get(tId);
        if (!tSet) {
          tSet = new Set();
          neighborMap.set(tId, tSet);
        }
        tSet.add(sId);
      }
    }
    buildNeighborMap();

    const resolvedEdgesCache: ResolvedEdge[] = [];
    function resolveEdges() {
      resolvedEdgesCache.length = 0;
      for (const edge of edgesRef.current) {
        if (
          typeof edge.source === "object" &&
          typeof edge.target === "object"
        ) {
          resolvedEdgesCache.push(edge as ResolvedEdge);
        }
      }
    }

    // Frame-loop optimization: track when edges change and cache expensive work
    let lastEdgesRef = edgesRef.current;
    let allEdgesResolved = false;
    let frameCount = 0;

    function tick() {
      sim.tick();
      tickViewport(viewportRef.current);

      // Positions changed from sim.tick — mark spatial index as stale
      markDirty(spatialIndexRef.current);

      // Only rebuild spatial index every 3 frames (~50ms lag on hover, acceptable).
      // The dirty flag + hash check inside rebuildIndex avoids redundant O(n) work.
      frameCount++;
      if (frameCount % 3 === 0) {
        rebuildIndex(spatialIndexRef.current, nodesRef.current);
      }

      // Rebuild neighbor map + reset edge resolution when edge data changes
      if (edgesRef.current !== lastEdgesRef) {
        buildNeighborMap();
        allEdgesResolved = false;
        lastEdgesRef = edgesRef.current;
      }

      // Only resolve edges until all are resolved (d3 mutates string IDs → objects
      // after first tick). Once all resolved, skip until edges change.
      if (!allEdgesResolved) {
        resolveEdges();
        allEdgesResolved =
          resolvedEdgesCache.length === edgesRef.current.length;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      if (!hasFittedRef.current && sim.alpha() < 0.15) {
        fitToNodes(viewportRef.current, nodesRef.current, w, h);
        hasFittedRef.current = true;
      }

      const hoveredId = interactionRef.current.hoveredNodeId;
      const neighborSet = new Set<string>();
      if (hoveredId) {
        neighborSet.add(hoveredId);
        const neighbors = neighborMap.get(hoveredId);
        if (neighbors) {
          for (const nId of neighbors) neighborSet.add(nId);
        }
      }

      render(
        ctx,
        w,
        h,
        dpr,
        nodesRef.current,
        resolvedEdgesCache,
        viewportRef.current,
        interactionRef.current,
        themeRef.current,
        neighborSet,
      );

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      cleanup();
      sim.stop();
    };
  }, [nodes, edges]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    zoomAt(
      viewportRef.current,
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
      canvas.clientWidth,
      canvas.clientHeight,
      1.3,
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    zoomAt(
      viewportRef.current,
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
      canvas.clientWidth,
      canvas.clientHeight,
      0.7,
    );
  }, []);

  const handleFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fitToNodes(
      viewportRef.current,
      nodesRef.current,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: "none" }}
      />
      <div className="absolute bottom-3 left-3 z-10 hidden md:flex flex-col gap-1">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={handleFit}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconFocusCentered size={16} />
        </button>
      </div>
    </div>
  );
}
