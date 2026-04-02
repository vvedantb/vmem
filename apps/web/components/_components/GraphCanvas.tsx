"use client";

import { useEffect, useRef } from "react";
import type {
  GraphNode,
  GraphEdge,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "./canvas/types";
import type { SimulationController } from "./canvas/simulation";
import { createSimulation } from "./canvas/simulation";
import { createViewport, tickViewport, fitToNodes } from "./canvas/viewport";
import { createSpatialIndex, rebuildIndex } from "./canvas/hit-test";
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
      nodesRef,
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

    function tick() {
      sim.tick();
      tickViewport(viewportRef.current);
      rebuildIndex(spatialIndexRef.current, nodesRef.current);
      resolveEdges();

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      if (!hasFittedRef.current && sim.simulation.alpha() < 0.15) {
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

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ touchAction: "none" }}
    />
  );
}
