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
  // TODO(cosmos): shift-drag link create — Cosmos has no built-in equivalent
  onLinkNodes: (sourceId: string, targetId: string) => void;
  onFocusNode?: (nodeId: string) => void;
  ref?: Ref<GraphCanvasHandle>;
}

const SPACE_SIZE = 4096;
const ZOOM_IN_FACTOR = 1.3;
const ZOOM_OUT_FACTOR = 0.7;

function CosmosGraphCanvas({
  nodes,
  edges,
  viewTheme,
  settings,
  focusNodeId,
  searchMatchSet,
  isSearchActive,
  showLabels: _showLabels,
  onHoverNode,
  onHoverEdge,
  onClickNode,
  onLinkNodes: _onLinkNodes,
  // TODO(cosmos): legacy dblclick → onFocusNode; Cosmos has no point-dblclick API
  onFocusNode: _onFocusNode,
  ref,
}: CosmosGraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const buffersRef = useRef<CosmosGraphBuffers | null>(null);

  const themeRef = useRef(viewTheme);
  const settingsRef = useRef(settings);
  const focusNodeIdRef = useRef(focusNodeId);
  const searchMatchSetRef = useRef(searchMatchSet);
  const isSearchActiveRef = useRef(isSearchActive);
  const callbacksRef = useRef({
    onHoverNode,
    onHoverEdge,
    onClickNode,
  });

  themeRef.current = viewTheme;
  settingsRef.current = settings;
  focusNodeIdRef.current = focusNodeId;
  searchMatchSetRef.current = searchMatchSet;
  isSearchActiveRef.current = isSearchActive;
  callbacksRef.current = {
    onHoverNode,
    onHoverEdge,
    onClickNode,
  };

  const applyFocusAndSearch = useCallback((graph: Graph) => {
    const buffers = buffersRef.current;
    if (!buffers) return;

    const focusId = focusNodeIdRef.current;
    const focusedPointIndex =
      focusId !== undefined && focusId !== null
        ? buffers.idToIndex.get(focusId)
        : undefined;

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
        outlinedPointIndices:
          focusedPointIndex !== undefined ? [focusedPointIndex] : undefined,
      });
      return;
    }

    graph.setConfigPartial({
      focusedPointIndex,
      highlightedPointIndices: undefined,
      highlightedLinkIndices: undefined,
      outlinedPointIndices:
        focusedPointIndex !== undefined ? [focusedPointIndex] : undefined,
    });
  }, []);

  // Create / destroy Cosmos instance when topology changes
  useEffect(() => {
    const host = hostRef.current;
    if (!host || nodes.length === 0) return;

    let cancelled = false;
    const buffers = buildCosmosGraphBuffers(
      nodes,
      edges,
      themeRef.current,
      SPACE_SIZE,
    );
    buffersRef.current = buffers;

    const bg = colorToRgba(themeRef.current.background);

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
      simulationRepulsion: Math.max(0.1, settingsRef.current.scalingRatio / 10),
      simulationGravity: Math.max(0.01, settingsRef.current.gravity * 0.25),
      attribution: "",
      onPointClick: (index) => {
        const id = buffersRef.current?.indexToId[index];
        if (id === undefined) return;
        callbacksRef.current.onClickNode(id);
      },
      onPointMouseOver: (index, pointPosition) => {
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
      },
      onPointMouseOut: () => {
        callbacksRef.current.onHoverNode(null);
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
    });

    graphRef.current = graph;

    graph.setPointPositions(buffers.positions);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setLinks(buffers.links);
    graph.setLinkColors(buffers.linkColors);
    graph.render();

    void graph.ready.then(() => {
      if (cancelled) return;
      applyFocusAndSearch(graph);
    });

    return () => {
      cancelled = true;
      graph.destroy();
      if (graphRef.current === graph) graphRef.current = null;
      buffersRef.current = null;
    };
  }, [nodes, edges, applyFocusAndSearch]);

  // Theme / physics without remounting
  useEffect(() => {
    const graph = graphRef.current;
    const buffers = buffersRef.current;
    if (!graph || !buffers) return;

    recolorCosmosGraphBuffers(buffers, viewTheme);
    graph.setPointColors(buffers.colors);
    graph.setPointSizes(buffers.sizes);
    graph.setLinkColors(buffers.linkColors);
    graph.setConfigPartial({
      backgroundColor: colorToRgba(viewTheme.background),
      pointGreyoutOpacity: viewTheme.dimAlpha,
      linkGreyoutOpacity: viewTheme.dimAlpha,
      simulationRepulsion: Math.max(0.1, settings.scalingRatio / 10),
      simulationGravity: Math.max(0.01, settings.gravity * 0.25),
    });
    graph.render();
  }, [viewTheme, settings]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    applyFocusAndSearch(graph);
  }, [focusNodeId, searchMatchSet, isSearchActive, applyFocusAndSearch]);

  const handleZoomIn = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_IN_FACTOR);
  }, []);

  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setZoomLevel(graph.getZoomLevel() * ZOOM_OUT_FACTOR);
  }, []);

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
      ref={hostRef}
      className="h-full w-full block"
      style={{ touchAction: "none" }}
    />
  );
}

export default CosmosGraphCanvas;
