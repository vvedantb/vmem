import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import { Graph } from "@cosmos.gl/graph";
import type { GraphNode, GraphEdge } from "@/lib/graph/types";
import type { GraphViewTheme } from "../graph-view-themes";
import type {
  GraphSettings,
  HoveredEdgeInfo,
  HoveredNodeInfo,
} from "@/lib/graph/graph-types";
import type { GraphCanvasHandle } from "../GraphCanvas";
import {
  buildCosmosGraphBuffers,
  recolorCosmosGraphBuffers,
  searchMatchIndices,
  type CosmosEdgeMeta,
  type CosmosGraphBuffers,
} from "./cosmos-adapters";
import { colorToRgba } from "./cosmos-color";
import {
  COSMOS_HIGH_NODE_COUNT,
  COSMOS_LOW_ZOOM_THRESHOLD,
  shouldShowCosmosLabel,
  shouldSkipCosmosLabels,
  truncateCosmosLabel,
} from "./cosmos-labels";
import {
  buildPointImageBuffers,
  emptyPointImageIndices,
  loadCosmosConnectorLogoAtlas,
  type CosmosLogoAtlas,
} from "./cosmos-logos";
import {
  COSMOS_INITIAL_SETTLE_ALPHA,
  COSMOS_SETTINGS_REHEAT_ALPHA,
  cosmosPhysicsFromSettings,
  cosmosWarmupTicks,
} from "./cosmos-physics";

interface CosmosGraphCanvasProps {
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

function fitPaddingForNodeCount(nodeCount: number): number {
  if (nodeCount <= 10) return 0.35;
  if (nodeCount <= 50) return 0.25;
  return 0.12;
}

function CosmosGraphCanvas({
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
}: CosmosGraphCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const buffersRef = useRef<CosmosGraphBuffers | null>(null);
  const logoAtlasRef = useRef<CosmosLogoAtlas | null>(null);
  const logosVisibleRef = useRef(true);
  const hoveredIndexRef = useRef<number | undefined>(undefined);
  const physicsSettingsReadyRef = useRef(false);

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

  const applyFocusAndSearch = useCallback((graph: Graph) => {
    const buffers = buffersRef.current;
    if (!buffers) return;

    const focusId = focusNodeIdRef.current;
    const focusedPointIndex =
      focusId !== undefined && focusId !== null
        ? buffers.idToIndex.get(focusId)
        : undefined;

    const outlined: number[] = [];
    if (focusedPointIndex !== undefined) outlined.push(focusedPointIndex);

    if (isSearchActiveRef.current) {
      const matches = searchMatchIndices(
        buffers.indexToId,
        searchMatchSetRef.current,
      );
      graph.setConfigPartial({
        focusedPointIndex,
        highlightedPointIndices: matches,
        highlightedLinkIndices:
          matches.length > 0 ? graph.getConnectedLinkIndices(matches) : [],
        outlinedPointIndices: outlined.length > 0 ? outlined : undefined,
      });
      return;
    }

    graph.setConfigPartial({
      focusedPointIndex,
      highlightedPointIndices: undefined,
      highlightedLinkIndices: undefined,
      outlinedPointIndices: outlined.length > 0 ? outlined : undefined,
    });
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
    const hasHover = hoveredIndex !== undefined;
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
  }, []);

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

    let cancelled = false;
    root.style.opacity = "0";
    const buffers = buildCosmosGraphBuffers(
      nodes,
      edges,
      themeRef.current,
      SPACE_SIZE,
    );
    buffersRef.current = buffers;
    hoveredIndexRef.current = undefined;
    logosVisibleRef.current = true;

    const bg = colorToRgba(themeRef.current.background);
    const physics = cosmosPhysicsFromSettings(
      settingsRef.current,
      nodes.length,
    );

    const graph = new Graph(host, {
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
        paintLabels(g);
      },
      onPointMouseOut: () => {
        hoveredIndexRef.current = undefined;
        callbacksRef.current.onHoverNode(null);
        const g = graphRef.current;
        if (g) paintLabels(g);
      },
      onLinkMouseOver: (linkIndex) => {
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
      },
      onLinkMouseOut: () => {
        callbacksRef.current.onHoverEdge?.(null);
      },
      onBackgroundClick: () => {
        callbacksRef.current.onHoverNode(null);
        callbacksRef.current.onHoverEdge?.(null);
      },
      onSimulationTick: (alpha, hoveredIndex) => {
        if (typeof hoveredIndex === "number") {
          hoveredIndexRef.current = hoveredIndex;
        }
        const g = graphRef.current;
        if (g) paintLabels(g);
        // Legacy SLEEP_ALPHA ≈ 0.005 — pause once visually still.
        if (typeof alpha === "number" && alpha < 0.01) {
          g?.pause();
        }
      },
      onZoom: () => {
        const g = graphRef.current;
        if (g) paintLabels(g);
      },
      onZoomEnd: () => {
        const g = graphRef.current;
        if (!g) return;
        paintLabels(g);
        applyConnectorLogos(g);
      },
    });

    graphRef.current = graph;

    graph.setPointPositions(buffers.positions);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setPointShapes(buffers.shapes);
    graph.setLinks(buffers.links);
    graph.setLinkColors(buffers.linkColors);
    graph.render();

    void graph.ready.then(() => {
      if (cancelled) return;
      graph.pause();
      const warmupTicks = cosmosWarmupTicks(buffers.indexToNode.length);
      for (let i = 0; i < warmupTicks; i++) graph.step();
      graph.setZoomTransformByPointPositions(
        Float32Array.from(graph.getPointPositions()),
        0,
        undefined,
        fitPaddingForNodeCount(buffers.indexToNode.length),
        false,
      );
      applyFocusAndSearch(graph);
      paintLabels(graph);
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
      graph.destroy();
      if (graphRef.current === graph) graphRef.current = null;
      buffersRef.current = null;
    };
  }, [nodes, edges, applyFocusAndSearch, paintLabels, applyConnectorLogos]);

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
    graph.setConfigPartial({
      backgroundColor: colorToRgba(viewTheme.background),
      pointGreyoutOpacity: viewTheme.dimAlpha,
      linkGreyoutOpacity: viewTheme.dimAlpha,
    });
    graph.render();
    paintLabels(graph);
  }, [viewTheme, paintLabels]);

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
    applyFocusAndSearch(graph);
  }, [focusNodeId, searchMatchSet, isSearchActive, applyFocusAndSearch]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    paintLabels(graph);
  }, [showLabels, paintLabels]);

  const handleZoomIn = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_IN_FACTOR);
    paintLabels(graph);
    applyConnectorLogos(graph);
  }, [paintLabels, applyConnectorLogos]);

  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_OUT_FACTOR);
    paintLabels(graph);
    applyConnectorLogos(graph);
  }, [paintLabels, applyConnectorLogos]);

  const handleFit = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    fit: handleFit,
  }));

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full block"
      style={{ touchAction: "none" }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      <canvas
        ref={labelCanvasRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden
      />
    </div>
  );
}

export default CosmosGraphCanvas;
