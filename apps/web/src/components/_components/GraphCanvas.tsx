import { useEffect, useRef, useImperativeHandle, type Ref } from "react";
import type {
  GraphNode,
  GraphEdge,
  ResolvedEdge,
  InteractionState,
  ViewportState,
} from "@/lib/graph/types";
import type { SimulationController } from "./canvas/simulation";
import { createSimulation, SLEEP_ALPHA } from "./canvas/simulation";
import {
  createViewport,
  tickViewport,
  fitToNodes,
  zoomAt,
} from "./canvas/viewport";
import { createSpatialIndex, rebuildIndex, markDirty } from "./canvas/hit-test";
import { render, createWorldLayerCache } from "./canvas/renderer";
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
} from "@/lib/graph/graph-types";

export interface GraphCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

// every graph gets the world-layer blit cache
const BLIT_CACHE_MIN_NODES = 0;

// while a pan/zoom gesture runs over a HOT simulation, gesture frames blit a snapshot of
const SETTLE_SNAPSHOT_MS = 150;

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
  onFocusNode?: (nodeId: string) => void;
  ref?: Ref<GraphCanvasHandle>;
}

function GraphCanvas({
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
  onFocusNode,
  ref,
}: GraphCanvasProps) {
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
    onFocusNode,
  });

  const simRef = useRef<SimulationController | null>(null);
  const resolvedEdgesRef = useRef<ResolvedEdge[]>([]);
  const viewportRef = useRef<ViewportState>(createViewport());
  const interactionRef = useRef<InteractionState>({
    hoveredNodeId: null,
    hoveredEdgeIndex: null,
    draggedNodeId: null,
    isPanning: false,
  });
  const spatialIndexRef = useRef(createSpatialIndex());
  const hasFittedRef = useRef(false);
  // render-on-demand: set on every React render (any prop change
  const needsRenderRef = useRef(true);
  // last-known position per node id, saved when a simulation tears down
  const lastPositionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  // connector logos preload asynchronously
  const connectorLogosRef = useRef<ConnectorLogoMap>(new Map());

  useEffect(() => {
    let cancelled = false;
    void loadConnectorLogos().then((map) => {
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
    const positionCache = lastPositionsRef.current;

    // reset viewport fit flag
    hasFittedRef.current = false;

    // carry over resting positions from the previous simulation for nodes
    // that survived the data swap (see lastPositionsRef)
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
              title: node.title,
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
          if (!edge) {
            callbacksRef.current.onHoverEdge?.(null);
            return;
          }
          const vp = viewportRef.current;
          const mx = ((edge.source.x ?? 0) + (edge.target.x ?? 0)) / 2;
          const my = ((edge.source.y ?? 0) + (edge.target.y ?? 0)) / 2;
          const sx = mx * vp.scale + vp.offsetX + canvas.clientWidth / 2;
          const sy = my * vp.scale + vp.offsetY + canvas.clientHeight / 2;
          // `wiki_parent` edges carry no reason — only tag and relates_to do
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
      // build a node lookup so we can resolve string-based source/target refs ourselves
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
    // resolve edges exactly once per edges-array identity
    let lastResolvedEdges: GraphEdge[] | null = null;
    let frameCount = 0;
    // spatial-index rebuild cadence while positions move
    const indexRebuildInterval = nodes.length > 20_000 ? 10 : 3;
    // world-layer blit cache
    const worldCache =
      nodes.length > BLIT_CACHE_MIN_NODES ? createWorldLayerCache() : null;
    let lastFrameWasBlit = false;
    // timestamp of the last full scene render — drives the snapshot-refresh
    // cadence when a gesture runs over a hot simulation (see viewportOnly)
    let lastSceneRenderAt = 0;
    // sim positions version captured at the last real scene paint (blits
    // excluded — they reuse the old bitmap). See positionsNeedPaint
    let lastPaintedSimVersion = -1;
    // render-on-demand state
    let lastInteractionKey = "";
    let lastVpOffsetX = Number.NaN;
    let lastVpOffsetY = Number.NaN;
    let lastVpScale = Number.NaN;
    let wasMoving = true;

    // AI-generated (Claude), prompt: "raf loop that skips redraws and blits world cache during pan zoom"
    // Modified by me: settle snapshot timing and neighbor highlight for hover focus
    function tick() {
      sim.tick();
      tickViewport(viewportRef.current);

      const simActive = sim.alpha() >= SLEEP_ALPHA;
      const isDragging = interactionRef.current.draggedNodeId !== null;
      const positionsMoving = simActive || isDragging;
      // the worker posts positions at ~30Hz while this loop runs at 60
      const simVersion = sim.positionsVersion();
      const positionsFresh = simVersion !== lastPaintedSimVersion;
      const positionsNeedPaint = isDragging || (simActive && positionsFresh);

      // compare viewport state frame-to-frame: catches spring/momentum from
      // tickViewport AND direct mutations from pan/pinch/wheel handlers
      const vp = viewportRef.current;
      const viewportMoved =
        vp.offsetX !== lastVpOffsetX ||
        vp.offsetY !== lastVpOffsetY ||
        vp.scale !== lastVpScale;
      lastVpOffsetX = vp.offsetX;
      lastVpOffsetY = vp.offsetY;
      lastVpScale = vp.scale;

      const ix = interactionRef.current;
      // mirrors hoverVisuals in renderer.ts
      const hoverVisualsEnabled = !(
        nodesRef.current.length > 5000 && vp.scale < 0.4
      );
      const interactionKey =
        (hoverVisualsEnabled
          ? `${ix.hoveredNodeId}|${ix.hoveredEdgeIndex}`
          : "-") + `|${ix.draggedNodeId}|${ix.isPanning}`;
      const interactionChanged = interactionKey !== lastInteractionKey;
      lastInteractionKey = interactionKey;

      // spatial index only needs rebuilding while node positions move
      if (positionsMoving && positionsNeedPaint) {
        markDirty(spatialIndexRef.current);
        frameCount++;
        if (frameCount % indexRebuildInterval === 0) {
          rebuildIndex(spatialIndexRef.current, nodesRef.current);
        }
      } else if (!positionsMoving && wasMoving) {
        // one final rebuild + repaint on settle so hit-testing and the canvas both
        markDirty(spatialIndexRef.current);
        rebuildIndex(spatialIndexRef.current, nodesRef.current);
        needsRenderRef.current = true;
      }
      wasMoving = positionsMoving;

      if (edgesRef.current !== lastEdgesRef) {
        buildNeighborMap();
        // clear stale edge-hover index: the old idx could now point to a
        // different edge (or past the end) after the edges array changes
        if (interactionRef.current.hoveredEdgeIndex !== null) {
          interactionRef.current.hoveredEdgeIndex = null;
          callbacksRef.current.onHoverEdge?.(null);
        }
        lastEdgesRef = edgesRef.current;
        needsRenderRef.current = true;
      }

      if (lastResolvedEdges !== edgesRef.current) {
        resolveEdges();
        lastResolvedEdges = edgesRef.current;
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

      // A blitted frame is approximate (scaled bitmap)
      if (lastFrameWasBlit && !viewportMoved) {
        needsRenderRef.current = true;
      }

      if (
        !positionsNeedPaint &&
        !viewportMoved &&
        !interactionChanged &&
        !needsRenderRef.current &&
        hasFittedRef.current
      ) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const propsChanged = needsRenderRef.current;
      needsRenderRef.current = false;
      // pan/zoom gesture in flight: spring still converging on target
      // scale/offset, an active pan, or leftover momentum
      const gestureActive =
        ix.isPanning ||
        Math.abs(vp.targetScale - vp.scale) > 0.001 ||
        Math.abs(vp.targetOffsetX - vp.offsetX) > 0.5 ||
        Math.abs(vp.targetOffsetY - vp.offsetY) > 0.5 ||
        Math.abs(vp.velocityX) > 0.5 ||
        Math.abs(vp.velocityY) > 0.5;
      // pan/zoom can blit a snapshot; refresh periodically while sim is hot
      const snapshotFresh =
        performance.now() - lastSceneRenderAt < SETTLE_SNAPSHOT_MS;
      // re-render if snapshot scale drifted too far (avoids blurry upscale)
      const cacheSharp =
        worldCache !== null &&
        worldCache.valid &&
        vp.scale / worldCache.scale < 1.25 &&
        vp.scale / worldCache.scale > 0.8;
      const viewportOnly =
        viewportMoved &&
        !interactionChanged &&
        !propsChanged &&
        hasFittedRef.current &&
        cacheSharp &&
        (!positionsMoving || (gestureActive && snapshotFresh));

      // fit on the first frame
      if (!hasFittedRef.current) {
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
        if (hoveredEdge) {
          neighborSet.add(hoveredEdge.source.id);
          neighborSet.add(hoveredEdge.target.id);
        }
      }

      try {
        render({
          ctx,
          canvasW: w,
          canvasH: h,
          dpr,
          nodes: nodesRef.current,
          edges: resolvedEdgesCache,
          vp: viewportRef.current,
          interaction: interactionRef.current,
          theme: themeRef.current,
          neighborSet,
          focusNodeId: focusNodeIdRef.current ?? null,
          searchMatchSet: searchMatchSetRef.current,
          isSearchActive: isSearchActiveRef.current,
          showLabels: showLabelsRef.current,
          connectorLogos: connectorLogosRef.current,
          worldCache,
          viewportOnly,
          gestureActive,
        });
        lastFrameWasBlit = viewportOnly && worldCache !== null;
        if (!lastFrameWasBlit) {
          lastSceneRenderAt = performance.now();
          lastPaintedSimVersion = simVersion;
        }
      } catch (err) {
        // keep the rAF loop alive — a single throw (e.g. bad canvas color)
        // must not blank the graph until remount
        console.error("[GraphCanvas] render failed:", err);
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      // snapshot final positions so the next simulation (new data) can
      // seed surviving nodes where they already rest
      const positions = positionCache;
      positions.clear();
      for (const node of nodes) {
        if (node.x !== undefined && node.y !== undefined) {
          positions.set(node.id, { x: node.x, y: node.y });
        }
      }
      cancelAnimationFrame(rafId);
      cleanup();
      sim.stop();
    };
  }, [nodes, edges]);

  const handleZoomIn = () => {
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
  };

  const handleZoomOut = () => {
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
  };

  const handleFit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fitToNodes(
      viewportRef.current,
      nodesRef.current,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  };

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
}

export default GraphCanvas;
