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
import { createSimulation, SLEEP_ALPHA } from "./canvas/simulation";
import {
  createViewport,
  tickViewport,
  fitToNodes,
  zoomAt,
} from "./canvas/viewport";
import { createSpatialIndex, rebuildIndex, markDirty } from "./canvas/hit-test";
import { render } from "./canvas/renderer";
import { attachInputHandlers } from "./canvas/input-handler";
import {
  loadConnectorLogos,
  type ConnectorLogoMap,
} from "./canvas/connector-logos";
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
  isSearchActive: boolean;
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
      isSearchActive,
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
    const isSearchActiveRef = useRef(isSearchActive);
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
    // Render-on-demand: set on every React render (any prop change — theme,
    // search, labels, focus…) so the canvas repaints once, then goes back to
    // sleep. The rAF loop also self-triggers on sim/viewport/interaction
    // motion; this flag covers everything that arrives via props.
    const needsRenderRef = useRef(true);
    // Last-known position per node id, saved when a simulation tears down.
    // Data swaps (load-more pages, live edges, filter changes) produce fresh
    // node objects with undefined x/y — carrying positions over means only
    // genuinely new nodes animate in instead of the whole layout resetting.
    const lastPositionsRef = useRef<Map<string, { x: number; y: number }>>(
      new Map(),
    );
    // Connector logos preload asynchronously. We hold an empty map on mount
    // and populate it once the images resolve — nodes render as plain circles
    // in the interim, no layout shift when the logos drop in.
    const connectorLogosRef = useRef<ConnectorLogoMap>(new Map());

    useEffect(() => {
      let cancelled = false;
      loadConnectorLogos().then((map) => {
        if (!cancelled) connectorLogosRef.current = map;
      });
      return () => {
        cancelled = true;
      };
    }, []);

    nodesRef.current = nodes;
    edgesRef.current = edges;
    themeRef.current = viewTheme;
    focusNodeIdRef.current = focusNodeId;
    searchMatchSetRef.current = searchMatchSet;
    isSearchActiveRef.current = isSearchActive;
    showLabelsRef.current = showLabels;
    callbacksRef.current = {
      onHoverNode,
      onHoverEdge,
      onClickNode,
      onLinkNodes,
      onFocusNode,
    };
    needsRenderRef.current = true;

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

      // Reset viewport fit flag — a new simulation starts from scratch, so the
      // viewport must re-fit once the layout settles. Without this, StrictMode
      // (dev) keeps the flag true from the first (torn-down) run and the second
      // run never fits, leaving the viewport aimed at the old clumped origin.
      hasFittedRef.current = false;

      // Carry over resting positions from the previous simulation for nodes
      // that survived the data swap (see lastPositionsRef).
      for (const node of nodes) {
        if (node.x !== undefined && node.y !== undefined) continue;
        const prev = lastPositionsRef.current.get(node.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
        }
      }

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
              score: edge.score,
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
        // Build a node lookup so we can resolve string-based source/target
        // refs ourselves. D3 only mutates edges that go through forceLink
        // (structural edges), and in the Worker path it doesn't mutate the
        // main-thread edge objects at all. This manual resolution handles
        // both cases uniformly.
        const nodeById = new Map<string, GraphNode>();
        for (const n of nodesRef.current) nodeById.set(n.id, n);

        resolvedEdgesCache.length = 0;
        for (const edge of edgesRef.current) {
          const sourceNode =
            typeof edge.source === "object"
              ? edge.source
              : nodeById.get(edge.source);
          const targetNode =
            typeof edge.target === "object"
              ? edge.target
              : nodeById.get(edge.target);
          if (sourceNode && targetNode) {
            resolvedEdgesCache.push({
              source: sourceNode,
              target: targetNode,
              edgeType: edge.edgeType,
              weight: edge.weight,
              reason: edge.reason,
              score: edge.score,
            });
          }
        }
      }

      let lastEdgesRef = edgesRef.current;
      let allEdgesResolved = false;
      let frameCount = 0;
      // Render-on-demand state. The rAF loop never stops (its idle cost is a
      // handful of comparisons), but all real work — physics-driven index
      // rebuilds and the canvas draw — is skipped while the simulation is
      // asleep, the camera is still, and no interaction/prop changed.
      let lastInteractionKey = "";
      let lastVpOffsetX = Number.NaN;
      let lastVpOffsetY = Number.NaN;
      let lastVpScale = Number.NaN;
      let wasMoving = true;

      function tick() {
        sim.tick();
        tickViewport(viewportRef.current);

        const simActive = sim.alpha() >= SLEEP_ALPHA;
        const isDragging = interactionRef.current.draggedNodeId !== null;
        const positionsMoving = simActive || isDragging;

        // Compare viewport state frame-to-frame: catches spring/momentum from
        // tickViewport AND direct mutations from pan/pinch/wheel handlers.
        const vp = viewportRef.current;
        const viewportMoved =
          vp.offsetX !== lastVpOffsetX ||
          vp.offsetY !== lastVpOffsetY ||
          vp.scale !== lastVpScale;
        lastVpOffsetX = vp.offsetX;
        lastVpOffsetY = vp.offsetY;
        lastVpScale = vp.scale;

        const ix = interactionRef.current;
        const interactionKey =
          `${ix.hoveredNodeId}|${ix.hoveredEdgeIndex}|${ix.draggedNodeId}|` +
          `${ix.linkSourceId}|${ix.isPanning}|` +
          (ix.linkSourceId ? `${ix.mouseWorldX},${ix.mouseWorldY}` : "");
        const interactionChanged = interactionKey !== lastInteractionKey;
        lastInteractionKey = interactionKey;

        // Spatial index only needs rebuilding while node positions move.
        if (positionsMoving) {
          markDirty(spatialIndexRef.current);
          frameCount++;
          if (frameCount % 3 === 0) {
            rebuildIndex(spatialIndexRef.current, nodesRef.current);
          }
        } else if (wasMoving) {
          // One final rebuild + repaint on settle so hit-testing and the
          // canvas both match the resting positions (the worker's last
          // position message can land after the previous rendered frame).
          markDirty(spatialIndexRef.current);
          rebuildIndex(spatialIndexRef.current, nodesRef.current);
          needsRenderRef.current = true;
        }
        wasMoving = positionsMoving;

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
          needsRenderRef.current = true;
        }

        if (!allEdgesResolved) {
          resolveEdges();
          allEdgesResolved =
            resolvedEdgesCache.length === edgesRef.current.length;
          needsRenderRef.current = true;
        }

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          needsRenderRef.current = true;
        }

        if (
          !positionsMoving &&
          !viewportMoved &&
          !interactionChanged &&
          !needsRenderRef.current &&
          hasFittedRef.current
        ) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        needsRenderRef.current = false;

        if (!hasFittedRef.current && sim.alpha() < 0.15) {
          fitToNodes(viewportRef.current, nodesRef.current, w, h);
          hasFittedRef.current = true;
        }

        const hoveredId = interactionRef.current.hoveredNodeId;
        const hoveredEdgeIndex = interactionRef.current.hoveredEdgeIndex;
        const neighborSet = new Set<string>();
        if (hoveredId) {
          neighborSet.add(hoveredId);
          const neighbors = neighborMap.get(hoveredId);
          if (neighbors) {
            for (const nId of neighbors) neighborSet.add(nId);
          }
        } else if (
          hoveredEdgeIndex !== null &&
          hoveredEdgeIndex < resolvedEdgesCache.length
        ) {
          const hoveredEdge = resolvedEdgesCache[hoveredEdgeIndex];
          neighborSet.add(hoveredEdge.source.id);
          neighborSet.add(hoveredEdge.target.id);
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
          isSearchActiveRef.current,
          showLabelsRef.current,
          connectorLogosRef.current,
        );

        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);

      return () => {
        // Snapshot final positions so the next simulation (new data) can
        // seed surviving nodes where they already rest.
        const positions = lastPositionsRef.current;
        positions.clear();
        for (const node of nodesRef.current) {
          if (node.x !== undefined && node.y !== undefined) {
            positions.set(node.id, { x: node.x, y: node.y });
          }
        }
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
