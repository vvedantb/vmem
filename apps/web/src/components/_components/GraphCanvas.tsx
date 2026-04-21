"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
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
import type {
  GraphSettings,
  HoveredEdgeInfo,
  HoveredNodeInfo,
} from "./graph-types";

export interface GraphCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewTheme: GraphViewTheme;
  settings: GraphSettings;
  focusNodeId?: string | null;
  searchMatchSet: Set<string>;
  showLabels: boolean;
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onHoverEdge?: (info: HoveredEdgeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
  onLinkNodes: (sourceId: string, targetId: string) => void;
  onFocusNode?: (nodeId: string) => void;
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(
    {
      nodes,
      edges,
      viewTheme,
      settings,
      focusNodeId,
      searchMatchSet,
      showLabels,
      onHoverNode,
      onHoverEdge,
      onClickNode,
      onLinkNodes,
      onFocusNode,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const themeRef = useRef(viewTheme);
    const settingsRef = useRef(settings);
    const focusNodeIdRef = useRef(focusNodeId);
    const searchMatchSetRef = useRef(searchMatchSet);
    const showLabelsRef = useRef(showLabels);
    const callbacksRef = useRef({
      onHoverNode,
      onHoverEdge,
      onClickNode,
      onLinkNodes,
      onFocusNode,
    });

    const simRef = useRef<SimulationController | null>(null);
    const resolvedEdgesRef = useRef<ResolvedEdge[]>([]);
    const viewportRef = useRef<ViewportState>(createViewport());
    const interactionRef = useRef<InteractionState>({
      hoveredNodeId: null,
      hoveredEdgeIndex: null,
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
    focusNodeIdRef.current = focusNodeId;
    searchMatchSetRef.current = searchMatchSet;
    showLabelsRef.current = showLabels;
    callbacksRef.current = {
      onHoverNode,
      onHoverEdge,
      onClickNode,
      onLinkNodes,
      onFocusNode,
    };

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
        resolvedEdgesRef,
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
          onHoverEdge(idx) {
            const edgeList = resolvedEdgesRef.current;
            if (idx === null || idx >= edgeList.length) {
              callbacksRef.current.onHoverEdge?.(null);
              return;
            }
            const edge = edgeList[idx];
            const vp = viewportRef.current;
            const mx = ((edge.source.x ?? 0) + (edge.target.x ?? 0)) / 2;
            const my = ((edge.source.y ?? 0) + (edge.target.y ?? 0)) / 2;
            const sx = mx * vp.scale + vp.offsetX + canvas.clientWidth / 2;
            const sy = my * vp.scale + vp.offsetY + canvas.clientHeight / 2;
            // `wiki_parent` edges carry no reason — only tag and relates_to do.
            const reason = edge.reason ?? null;
            callbacksRef.current.onHoverEdge?.({
              edgeType: edge.edgeType,
              sourceTitle: edge.source.title,
              targetTitle: edge.target.title,
              reason,
              viewportX: sx,
              viewportY: sy,
            });
          },
          onClickNode(nodeId) {
            callbacksRef.current.onClickNode(nodeId);
          },
          onLinkNodes(sourceId, targetId) {
            callbacksRef.current.onLinkNodes(sourceId, targetId);
          },
          onFocusNode(nodeId) {
            callbacksRef.current.onFocusNode?.(nodeId);
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
      resolvedEdgesRef.current = resolvedEdgesCache;
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

      let lastEdgesRef = edgesRef.current;
      let allEdgesResolved = false;
      let frameCount = 0;

      function tick() {
        sim.tick();
        tickViewport(viewportRef.current);

        markDirty(spatialIndexRef.current);

        frameCount++;
        if (frameCount % 3 === 0) {
          rebuildIndex(spatialIndexRef.current, nodesRef.current);
        }

        if (edgesRef.current !== lastEdgesRef) {
          buildNeighborMap();
          allEdgesResolved = false;
          // Clear stale edge-hover index: the old idx could now point to a
          // different edge (or past the end) after the edges array changes.
          if (interactionRef.current.hoveredEdgeIndex !== null) {
            interactionRef.current.hoveredEdgeIndex = null;
            callbacksRef.current.onHoverEdge?.(null);
          }
          lastEdgesRef = edgesRef.current;
        }

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
          focusNodeIdRef.current ?? null,
          searchMatchSetRef.current,
          showLabelsRef.current,
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

    useImperativeHandle(ref, () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fit: handleFit,
    }));

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: "none" }}
      />
    );
  },
);

export default GraphCanvas;
