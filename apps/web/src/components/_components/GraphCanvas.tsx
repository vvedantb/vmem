import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Graph } from "@cosmos.gl/graph";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";
import type { GraphViewTheme } from "./graph-view-themes";
import type {
  GraphSettings,
  HoveredEdgeInfo,
  HoveredNodeInfo,
} from "@/lib/graph/graph-types";
import { GraphStatus } from "./GraphStatus";
import {
  buildCosmosGraphBuffers,
  capturePointPositions,
  recolorCosmosGraphBuffers,
  searchMatchIndices,
  type CosmosEdgeMeta,
  type CosmosGraphBuffers,
} from "./cosmos/cosmos-adapters";
import { colorToRgba } from "./cosmos/cosmos-color";
import { paintCosmosGlow } from "./cosmos/cosmos-glow";
import { computeHighlightPoints } from "./cosmos/cosmos-highlight";
import {
  COSMOS_EDGE_LABEL,
  COSMOS_HIGH_NODE_COUNT,
  COSMOS_LOW_ZOOM_THRESHOLD,
  shouldShowCosmosLabel,
  shouldSkipCosmosLabels,
  truncateCosmosLabel,
} from "./cosmos/cosmos-labels";
import {
  buildPointImageBuffers,
  emptyPointImageIndices,
  loadCosmosConnectorLogoAtlas,
  type CosmosLogoAtlas,
} from "./cosmos/cosmos-logos";
import {
  COSMOS_INITIAL_SETTLE_ALPHA,
  COSMOS_SETTINGS_REHEAT_ALPHA,
  cosmosPhysicsFromSettings,
  cosmosWarmupTicks,
} from "./cosmos/cosmos-physics";

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
  onFocusNode?: (nodeId: string) => void;
  ref?: Ref<GraphCanvasHandle>;
}

const SPACE_SIZE = 4096;
const ZOOM_IN_FACTOR = 1.3;
const ZOOM_OUT_FACTOR = 0.7;
const POINT_SAMPLING_DISTANCE = 80;
const MAX_LABELS = 48;
const FOCUSED_LINK_WIDTH_INCREASE = 2;

function fitPaddingForNodeCount(nodeCount: number): number {
  if (nodeCount <= 10) return 0.35;
  if (nodeCount <= 50) return 0.25;
  return 0.12;
}

function graphBackgroundRgba(
  theme: GraphViewTheme,
): [number, number, number, number] {
  if (theme.glow.enabled) return [0, 0, 0, 0];
  return colorToRgba(theme.background);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // ── REMOVABLE: dark-theme glow (start) — to remove, delete cosmos-glow.ts and every block between these markers
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const gestureActiveRef = useRef(false);
  const highlightedPointSetRef = useRef<Set<number> | undefined>(undefined);
  // ── REMOVABLE: dark-theme glow (end)
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const buffersRef = useRef<CosmosGraphBuffers | null>(null);
  const logoAtlasRef = useRef<CosmosLogoAtlas | null>(null);
  const logosVisibleRef = useRef(true);
  const hoveredIndexRef = useRef<number | undefined>(undefined);
  const hoveredLinkIndexRef = useRef<number | undefined>(undefined);
  const lastPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const physicsSettingsReadyRef = useRef(false);
  const [webglError, setWebglError] = useState(false);

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

  themeRef.current = viewTheme;
  settingsRef.current = settings;
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

  const applyVisualState = useCallback((graph: Graph) => {
    const buffers = buffersRef.current;
    if (!buffers) return;

    const focusId = focusNodeIdRef.current;
    const focusedPointIndex =
      focusId !== undefined && focusId !== null
        ? buffers.idToIndex.get(focusId)
        : undefined;

    const outlined: number[] = [];
    if (focusedPointIndex !== undefined) outlined.push(focusedPointIndex);

    const zoom = graph.getZoomLevel();
    const skipHoverHighlight =
      buffers.indexToNode.length > COSMOS_HIGH_NODE_COUNT &&
      zoom < COSMOS_LOW_ZOOM_THRESHOLD;

    let hoveredPointIndex: number | undefined;
    let neighborIndices: number[] | undefined;
    let hoveredLinkEndpoints: {
      sourceIndex: number;
      targetIndex: number;
      linkIndex: number;
    } | null = null;

    if (!skipHoverHighlight) {
      const linkIdx = hoveredLinkIndexRef.current;
      if (linkIdx !== undefined) {
        const meta = buffers.edgeMeta[linkIdx];
        if (meta) {
          hoveredLinkEndpoints = {
            sourceIndex: meta.sourceIndex,
            targetIndex: meta.targetIndex,
            linkIndex: linkIdx,
          };
        }
      } else if (hoveredIndexRef.current !== undefined) {
        hoveredPointIndex = hoveredIndexRef.current;
        neighborIndices = graph.getNeighboringPointIndices(hoveredPointIndex);
      }
    }

    const searchMatches = isSearchActiveRef.current
      ? searchMatchIndices(buffers.indexToId, searchMatchSetRef.current)
      : undefined;

    const { highlightedPointIndices, focusedLinkIndex } =
      computeHighlightPoints({
        hoveredPointIndex,
        neighborIndices,
        hoveredLinkEndpoints,
        isSearchActive: isSearchActiveRef.current,
        searchMatchIndices: searchMatches,
      });

    graph.setConfigPartial({
      focusedPointIndex,
      focusedLinkIndex,
      focusedLinkWidthIncrease: FOCUSED_LINK_WIDTH_INCREASE,
      highlightedPointIndices,
      highlightedLinkIndices: highlightedPointIndices
        ? graph.getConnectedLinkIndices(highlightedPointIndices)
        : undefined,
      outlinedPointIndices: outlined.length > 0 ? outlined : undefined,
    });
    // ── REMOVABLE: dark-theme glow (start)
    highlightedPointSetRef.current =
      highlightedPointIndices !== undefined
        ? new Set(highlightedPointIndices)
        : undefined;
    // ── REMOVABLE: dark-theme glow (end)
  }, []);

  const paintLabels = useCallback((graph: Graph) => {
    const canvas = labelCanvasRef.current;
    const buffers = buffersRef.current;
    const root = rootRef.current;
    if (!canvas || !buffers || !root) return;

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

    const zoom = graph.getZoomLevel();
    if (
      shouldSkipCosmosLabels(
        showLabelsRef.current,
        zoom,
        buffers.indexToNode.length,
      )
    ) {
      return;
    }

    const theme = themeRef.current;
    const hoveredIndex = hoveredIndexRef.current;
    const hoveredLinkIndex = hoveredLinkIndexRef.current;
    const hasHover =
      hoveredIndex !== undefined || hoveredLinkIndex !== undefined;
    const lowZoom = zoom < COSMOS_LOW_ZOOM_THRESHOLD;
    const neighborSet = new Set<number>();
    if (hoveredIndex !== undefined) {
      neighborSet.add(hoveredIndex);
      for (const n of graph.getNeighboringPointIndices(hoveredIndex)) {
        neighborSet.add(n);
      }
    }

    const fontSize = Math.max(10, 12 / Math.max(zoom, 0.5));
    ctx.font = `500 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const { indices, positions } = graph.getSampledPoints();
    const toDraw = new Map<number, { x: number; y: number }>();

    const allPositions = graph.getPointPositions();
    if (hoveredIndex !== undefined) {
      for (const idx of neighborSet) {
        const px = allPositions[idx * 2];
        const py = allPositions[idx * 2 + 1];
        if (px === undefined || py === undefined) continue;
        const [sx, sy] = graph.spaceToScreenPosition([px, py]);
        toDraw.set(idx, { x: sx, y: sy });
      }
    }

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (idx === undefined) continue;
      if (toDraw.has(idx)) continue;
      const sx = positions[i * 2];
      const sy = positions[i * 2 + 1];
      if (sx === undefined || sy === undefined) continue;
      const [screenX, screenY] = graph.spaceToScreenPosition([sx, sy]);
      toDraw.set(idx, { x: screenX, y: screenY });
      if (toDraw.size >= MAX_LABELS) break;
    }

    let painted = 0;
    for (const [idx, screen] of toDraw) {
      if (painted >= MAX_LABELS) break;
      const node = buffers.indexToNode[idx];
      if (!node) continue;

      const pointSize = buffers.sizes[idx] ?? Math.max(2, node.size * 2);
      const screenRadius = (pointSize / 2) * zoom;
      const isHovered = idx === hoveredIndex;
      const isNeighbor = neighborSet.has(idx);

      if (
        !shouldShowCosmosLabel({
          screenRadius,
          isHovered,
          isNeighbor,
          hasHover,
        })
      ) {
        continue;
      }

      ctx.fillStyle = isHovered ? theme.label.color : theme.label.secondary;
      ctx.fillText(
        truncateCosmosLabel(node.title),
        screen.x,
        screen.y - Math.min(screenRadius * 0.35, fontSize * 0.5),
      );
      painted += 1;
    }

    if (!lowZoom && (hoveredLinkIndex !== undefined || neighborSet.size > 1)) {
      const pillFontSize = Math.max(8, 10 / Math.max(zoom, 0.5));
      ctx.font = `400 ${pillFontSize}px "Instrument Sans", system-ui, sans-serif`;
      const allPositions = graph.getPointPositions();

      for (let linkIdx = 0; linkIdx < buffers.edgeMeta.length; linkIdx++) {
        const meta = buffers.edgeMeta[linkIdx];
        if (!meta) continue;
        const isHoveredEdge = hoveredLinkIndex === linkIdx;
        const isHoveredNodeEdge =
          hoveredIndex !== undefined &&
          neighborSet.has(meta.sourceIndex) &&
          neighborSet.has(meta.targetIndex);
        if (!isHoveredEdge && !isHoveredNodeEdge) continue;

        const sx = allPositions[meta.sourceIndex * 2];
        const sy = allPositions[meta.sourceIndex * 2 + 1];
        const tx = allPositions[meta.targetIndex * 2];
        const ty = allPositions[meta.targetIndex * 2 + 1];
        if (
          sx === undefined ||
          sy === undefined ||
          tx === undefined ||
          ty === undefined
        ) {
          continue;
        }
        const [mx, my] = graph.spaceToScreenPosition([
          (sx + tx) / 2,
          (sy + ty) / 2,
        ]);
        const label = COSMOS_EDGE_LABEL[meta.edgeType];
        const metrics = ctx.measureText(label);
        const padX = 4;
        const padY = 2;
        const bgW = metrics.width + padX * 2;
        const bgH = pillFontSize + padY * 2;

        ctx.fillStyle = theme.background + "cc";
        ctx.beginPath();
        ctx.roundRect(mx - bgW / 2, my - bgH / 2, bgW, bgH, 3);
        ctx.fill();

        ctx.fillStyle = theme.label.secondary;
        ctx.fillText(label, mx, my);
      }
    }
  }, []);

  const paintGlow = useCallback((graph: Graph) => {
    // ── REMOVABLE: dark-theme glow (start)
    const canvas = glowCanvasRef.current;
    const buffers = buffersRef.current;
    const root = rootRef.current;
    if (!canvas || !buffers || !root) return;
    paintCosmosGlow({
      canvas,
      root,
      graph,
      buffers,
      theme: themeRef.current,
      hoveredPointIndex: hoveredIndexRef.current,
      gestureActive: gestureActiveRef.current,
      isPointDimmed: (index) => {
        const highlighted = highlightedPointSetRef.current;
        if (highlighted === undefined) return false;
        return !highlighted.has(index);
      },
    });
    // ── REMOVABLE: dark-theme glow (end)
  }, []);

  const paintSceneOverlays = useCallback(
    (graph: Graph) => {
      paintGlow(graph);
      paintLabels(graph);
    },
    [paintGlow, paintLabels],
  );

  const applyConnectorLogos = useCallback((graph: Graph, force = false) => {
    const buffers = buffersRef.current;
    const atlas = logoAtlasRef.current;
    if (!buffers || !atlas || atlas.images.length === 0) return;

    const zoom = graph.getZoomLevel();
    const highNodeCount = buffers.indexToNode.length > COSMOS_HIGH_NODE_COUNT;
    const shouldShow = zoom >= COSMOS_LOW_ZOOM_THRESHOLD && !highNodeCount;

    if (!force && shouldShow === logosVisibleRef.current) return;
    logosVisibleRef.current = shouldShow;

    if (!shouldShow) {
      graph.setPointImageIndices(
        emptyPointImageIndices(buffers.indexToNode.length),
      );
      graph.render();
      return;
    }

    const { indices, sizes } = buildPointImageBuffers(
      buffers.indexToNode,
      atlas.sourceTypeToAtlasIndex,
    );
    graph.setImageData(atlas.images);
    graph.setPointImageIndices(indices);
    graph.setPointImageSizes(sizes);
    graph.render();
  }, []);

  // Create / destroy Cosmos instance when topology changes
  useEffect(() => {
    const host = hostRef.current;
    const root = rootRef.current;
    if (!host || !root || nodes.length === 0) return;

    setWebglError(false);
    let cancelled = false;
    root.style.opacity = "0";
    const buffers = buildCosmosGraphBuffers(
      nodes,
      edges,
      themeRef.current,
      SPACE_SIZE,
      lastPositionsRef.current,
    );
    buffersRef.current = buffers;
    hoveredIndexRef.current = undefined;
    hoveredLinkIndexRef.current = undefined;
    logosVisibleRef.current = true;

    const bg = graphBackgroundRgba(themeRef.current);
    const physics = cosmosPhysicsFromSettings(
      settingsRef.current,
      nodes.length,
    );

    let graph: Graph;
    try {
      graph = new Graph(host, {
        backgroundColor: bg,
        spaceSize: SPACE_SIZE,
        enableSimulation: true,
        enableDrag: true,
        enableZoom: true,
        fitViewOnInit: true,
        fitViewDelay: 100,
        fitViewPadding: 0.12,
        renderHoveredPointRing: true,
        hoveredPointCursor: "pointer",
        hoveredLinkCursor: "pointer",
        pointGreyoutOpacity: themeRef.current.dimAlpha,
        linkGreyoutOpacity: themeRef.current.dimAlpha,
        focusedLinkWidthIncrease: FOCUSED_LINK_WIDTH_INCREASE,
        pointSamplingDistance: POINT_SAMPLING_DISTANCE,
        ...physics,
        attribution: "",
        onClick: (index, _pointPosition, event) => {
          if (event.detail !== 2) return;
          if (index === undefined) return;
          const id = buffersRef.current?.indexToId[index];
          if (id === undefined) return;
          callbacksRef.current.onFocusNode?.(id);
        },
        onPointClick: (index, _pointPosition, event) => {
          if (event.detail === 2) return;
          const id = buffersRef.current?.indexToId[index];
          if (id === undefined) return;
          callbacksRef.current.onClickNode(id);
        },
        onPointMouseOver: (index, pointPosition) => {
          hoveredIndexRef.current = index;
          hoveredLinkIndexRef.current = undefined;
          const buffersNow = buffersRef.current;
          const g = graphRef.current;
          if (!buffersNow || !g) return;
          const node = buffersNow.indexToNode[index];
          if (!node) return;
          const [viewportX, viewportY] = g.spaceToScreenPosition(pointPosition);
          callbacksRef.current.onHoverNode({
            title: node.title,
            viewportX,
            viewportY,
          });
          applyVisualState(g);
          paintSceneOverlays(g);
        },
        onPointMouseOut: () => {
          hoveredIndexRef.current = undefined;
          callbacksRef.current.onHoverNode(null);
          const g = graphRef.current;
          if (!g) return;
          applyVisualState(g);
          paintSceneOverlays(g);
        },
        onLinkMouseOver: (linkIndex) => {
          hoveredLinkIndexRef.current = linkIndex;
          hoveredIndexRef.current = undefined;
          callbacksRef.current.onHoverNode(null);
          const buffersNow = buffersRef.current;
          const g = graphRef.current;
          const meta: CosmosEdgeMeta | undefined =
            buffersNow?.edgeMeta[linkIndex];
          if (!buffersNow || !g || !meta) {
            callbacksRef.current.onHoverEdge?.(null);
            return;
          }
          const positions = g.getPointPositions();
          const sx = positions[meta.sourceIndex * 2];
          const sy = positions[meta.sourceIndex * 2 + 1];
          const tx = positions[meta.targetIndex * 2];
          const ty = positions[meta.targetIndex * 2 + 1];
          if (
            sx === undefined ||
            sy === undefined ||
            tx === undefined ||
            ty === undefined
          ) {
            callbacksRef.current.onHoverEdge?.(null);
            return;
          }
          const [viewportX, viewportY] = g.spaceToScreenPosition([
            (sx + tx) / 2,
            (sy + ty) / 2,
          ]);
          callbacksRef.current.onHoverEdge?.({
            edgeType: meta.edgeType,
            sourceTitle: meta.sourceTitle,
            targetTitle: meta.targetTitle,
            reason: meta.reason,
            score: meta.score,
            viewportX,
            viewportY,
          });
          applyVisualState(g);
          paintSceneOverlays(g);
        },
        onLinkMouseOut: () => {
          hoveredLinkIndexRef.current = undefined;
          callbacksRef.current.onHoverEdge?.(null);
          const g = graphRef.current;
          if (!g) return;
          applyVisualState(g);
          paintSceneOverlays(g);
        },
        onBackgroundClick: () => {
          hoveredIndexRef.current = undefined;
          hoveredLinkIndexRef.current = undefined;
          callbacksRef.current.onHoverNode(null);
          callbacksRef.current.onHoverEdge?.(null);
          const g = graphRef.current;
          if (g) applyVisualState(g);
        },
        onDragStart: () => {
          gestureActiveRef.current = true;
          const g = graphRef.current;
          if (!g) return;
          g.unpause();
          g.start(COSMOS_SETTINGS_REHEAT_ALPHA);
        },
        onDragEnd: () => {
          gestureActiveRef.current = false;
          const g = graphRef.current;
          if (g) paintSceneOverlays(g);
        },
        onSimulationTick: (alpha, hoveredIndex) => {
          if (typeof hoveredIndex === "number") {
            hoveredIndexRef.current = hoveredIndex;
          }
          const g = graphRef.current;
          if (g) paintSceneOverlays(g);
          // Legacy SLEEP_ALPHA ≈ 0.005 — pause once visually still.
          if (typeof alpha === "number" && alpha < 0.01) {
            g?.pause();
          }
        },
        onZoom: () => {
          gestureActiveRef.current = true;
          const g = graphRef.current;
          if (g) paintSceneOverlays(g);
        },
        onZoomEnd: () => {
          gestureActiveRef.current = false;
          const g = graphRef.current;
          if (!g) return;
          paintSceneOverlays(g);
          applyConnectorLogos(g);
        },
      });
    } catch {
      setWebglError(true);
      root.style.opacity = "";
      return;
    }

    graphRef.current = graph;

    graph.setPointPositions(buffers.positions);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setPointShapes(buffers.shapes);
    graph.setLinks(buffers.links);
    graph.setLinkColors(buffers.linkColors);
    graph.setLinkWidths(buffers.linkWidths);
    graph.setLinkStrength(buffers.linkStrengths);
    graph.render();

    void graph.ready.then(() => {
      if (cancelled) return;
      graph.pause();
      const seededCount = lastPositionsRef.current.size;
      const mostlyPersisted =
        seededCount > 0 && seededCount >= buffers.indexToNode.length * 0.5;
      const warmupTicks = mostlyPersisted
        ? Math.min(cosmosWarmupTicks(buffers.indexToNode.length), 30)
        : cosmosWarmupTicks(buffers.indexToNode.length);
      for (let i = 0; i < warmupTicks; i++) graph.step();
      graph.setZoomTransformByPointPositions(
        Float32Array.from(graph.getPointPositions()),
        0,
        undefined,
        fitPaddingForNodeCount(buffers.indexToNode.length),
        false,
      );
      applyVisualState(graph);
      paintSceneOverlays(graph);
      applyConnectorLogos(graph, true);
      root.style.opacity = "1";
      graph.start(COSMOS_INITIAL_SETTLE_ALPHA);
    });

    void loadCosmosConnectorLogoAtlas().then((atlas) => {
      if (cancelled) return;
      logoAtlasRef.current = atlas;
      const g = graphRef.current;
      if (g === graph) applyConnectorLogos(g, true);
    });

    return () => {
      cancelled = true;
      root.style.opacity = "";
      lastPositionsRef.current = capturePointPositions(
        buffers.indexToId,
        graph.getPointPositions(),
      );
      graph.destroy();
      if (graphRef.current === graph) graphRef.current = null;
      buffersRef.current = null;
    };
  }, [nodes, edges, applyVisualState, paintSceneOverlays, applyConnectorLogos]);

  // Theme colours only — do not touch simulation (avoids perpetual reheat).
  useEffect(() => {
    const graph = graphRef.current;
    const buffers = buffersRef.current;
    if (!graph || !buffers) return;

    recolorCosmosGraphBuffers(buffers, viewTheme);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setPointShapes(buffers.shapes);
    graph.setLinkColors(buffers.linkColors);
    graph.setLinkWidths(buffers.linkWidths);
    graph.setLinkStrength(buffers.linkStrengths);
    graph.setConfigPartial({
      backgroundColor: graphBackgroundRgba(viewTheme),
      pointGreyoutOpacity: viewTheme.dimAlpha,
      linkGreyoutOpacity: viewTheme.dimAlpha,
    });
    graph.render();
    paintSceneOverlays(graph);
  }, [viewTheme, paintSceneOverlays]);

  // Spread / Gravity → update forces and mild reheat (legacy reheat behaviour).
  useEffect(() => {
    if (!physicsSettingsReadyRef.current) {
      physicsSettingsReadyRef.current = true;
      return;
    }
    const graph = graphRef.current;
    const buffers = buffersRef.current;
    if (!graph || !buffers) return;

    graph.setConfigPartial(
      cosmosPhysicsFromSettings(settings, buffers.indexToNode.length),
    );
    graph.unpause();
    graph.start(COSMOS_SETTINGS_REHEAT_ALPHA);
  }, [settings]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    applyVisualState(graph);
  }, [focusNodeId, searchMatchSet, isSearchActive, applyVisualState]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    paintSceneOverlays(graph);
  }, [showLabels, paintSceneOverlays]);

  const handleZoomIn = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_IN_FACTOR);
    paintSceneOverlays(graph);
    applyConnectorLogos(graph);
  }, [paintSceneOverlays, applyConnectorLogos]);

  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_OUT_FACTOR);
    paintSceneOverlays(graph);
    applyConnectorLogos(graph);
  }, [paintSceneOverlays, applyConnectorLogos]);

  const handleFit = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    fit: handleFit,
  }));

  if (webglError) {
    return (
      <GraphStatus
        variant="error"
        title="WebGL 2 is required to display the graph"
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full block"
      style={{
        touchAction: "none",
        backgroundColor: viewTheme.background,
      }}
    >
      {/* ── REMOVABLE: dark-theme glow (start) */}
      <canvas
        ref={glowCanvasRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      />
      {/* ── REMOVABLE: dark-theme glow (end) */}
      <div ref={hostRef} className="absolute inset-0" />
      <canvas
        ref={labelCanvasRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      />
    </div>
  );
}

export default GraphCanvas;
