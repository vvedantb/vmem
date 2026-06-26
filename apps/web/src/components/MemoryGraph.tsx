"use client";

/**
 * Pure graph canvas — renders the force-directed graph and the overlays that
 * are inherently canvas-local (zoom nav, focus-mode back button, hover tooltip,
 * node detail panel).
 *
 * All filter/search/display state lives in `useMemoryGraphController` and is
 * passed in via the `controller` prop. Chrome (filters, options, search,
 * legend, add-memory) lives in the page header via `GraphHeaderControls`.
 *
 * Canvas-local state intentionally kept here:
 *   - selectedNodeId / hoveredNode: driven by canvas pointer events
 *   - linkMemories action: fired directly by the canvas link gesture
 *   - deleteMemory: fired by the detail panel
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useAction } from "convex/react";
import { IconMoodEmpty, IconArrowBack } from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";
import type { GraphScope } from "@/routes/_main/$profileId/memories/-searchParams";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { VmemSpinner } from "@/components/svg-animations";
import { api } from "@vmem/backend";
import type {
  HoveredEdgeInfo,
  HoveredNodeInfo,
} from "./_components/graph-types";
import { getRelatedNodes } from "./_components/graph-data";
import GraphCanvas from "./_components/GraphCanvas";
import type { GraphCanvasHandle } from "./_components/GraphCanvas";
import GraphNavControls from "./_components/GraphNavControls";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphEdgeTooltip from "./_components/GraphEdgeTooltip";
import GraphDetailPanel from "./_components/GraphDetailPanel";
import type { MemoryGraphController } from "@/hooks/useMemoryGraphController";

interface MemoryGraphProps {
  controller: MemoryGraphController;
  /** Explicit focus from the URL — null in local scope means "newest memory". */
  focusNodeId: string | null;
  /** id → focus that node (local scope); null → switch to the global graph. */
  onFocusChange: (id: string | null) => void;
  scope: GraphScope;
  depth: number;
  onDepthChange: (depth: number) => void;
}

const LOCAL_GRAPH_DEPTHS = [1, 2, 3] as const;

export default function MemoryGraph({
  controller,
  focusNodeId,
  onFocusChange,
  scope,
  depth,
  onDepthChange,
}: MemoryGraphProps) {
  const { deleteMemory } = useMemoryContext();
  const linkMemories = useAction(api.relationshipApi.linkMemories);
  const getNodeContent = useAction(api.graphApi.getNodeContent);
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // Canvas-local state (purely driven by pointer events on the canvas).
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);

  // Lazy memory-body cache. The graph payload no longer ships memory content
  // (dropped to fit Convex's 1 MiB value limit at ~2000 memories), so we
  // pull content on-demand when the user hovers or clicks a memory node.
  // A Set tracks in-flight fetches to avoid duplicate round-trips when the
  // user hovers the same node repeatedly.
  const [contentCache, setContentCache] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const inflightRef = useRef<Set<string>>(new Set());

  const {
    apiNodes,
    graphNodes,
    graphEdges,
    graphSettings,
    viewTheme,
    searchMatchSet,
    isSearchActive,
    resolvedFocusNodeId,
    loadedMemoryCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore,
    onLoadMore,
    isLoading,
    isError,
    error,
  } = controller;

  const ensureMemoryContent = useCallback(
    (nodeId: string) => {
      if (contentCache.has(nodeId)) return;
      if (inflightRef.current.has(nodeId)) return;
      inflightRef.current.add(nodeId);
      getNodeContent({ memoryId: nodeId })
        .then((content) => {
          setContentCache((prev) => {
            const next = new Map(prev);
            next.set(nodeId, content);
            return next;
          });
        })
        .finally(() => {
          inflightRef.current.delete(nodeId);
        });
    },
    [contentCache, getNodeContent],
  );

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graphNodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    // Inline content (wiki docs, skills) wins. For memory nodes, content is
    // undefined at first and becomes a string once the lazy fetch resolves;
    // the detail panel shows a loading spinner while it's undefined.
    const content =
      node.content !== undefined ? node.content : contentCache.get(node.id);
    return {
      id: node.id,
      title: node.title,
      content,
      tags: node.tags,
      createdAt: node.createdAt,
    };
  }, [selectedNodeId, graphNodes, contentCache]);

  const relatedNodes = useMemo(() => {
    if (!selectedNodeId) return [];
    return getRelatedNodes(selectedNodeId, graphEdges, graphNodes);
  }, [selectedNodeId, graphEdges, graphNodes]);

  // Canvas handlers
  const handleHoverNode = useCallback((info: HoveredNodeInfo | null) => {
    setHoveredNode(info);
  }, []);

  const handleClickNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setHoveredNode(null);
      const node = graphNodes.find((n) => n.id === nodeId);
      if (node && node.kind === "memory" && node.content === undefined) {
        ensureMemoryContent(nodeId);
      }
    },
    [graphNodes, ensureMemoryContent],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigateNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      // Only memory nodes can be a local-graph focus — wiki/skill/entity ids
      // have no Neo4j neighbourhood and would land on an empty graph.
      const node = graphNodes.find((n) => n.id === nodeId);
      if (!node || node.kind !== "memory") return;
      onFocusChange(nodeId);
      setSelectedNodeId(null);
    },
    [onFocusChange, graphNodes],
  );

  const handleBackToGlobal = useCallback(() => {
    onFocusChange(null);
  }, [onFocusChange]);

  const handleLinkNodes = useCallback(
    async (sourceId: string, targetId: string) => {
      await linkMemories({
        memoryIdA: sourceId,
        memoryIdB: targetId,
        reason: "user linked",
      });
    },
    [linkMemories],
  );

  // Loading / error / empty states
  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2 text-balance">
          Failed to load graph
        </h3>
        <p className="text-sm text-muted max-w-sm">{error?.message}</p>
      </div>
    );
  }

  if (apiNodes.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2 text-balance">
          No memories to visualize
        </h3>
        <p className="text-sm text-muted">
          Add some memories to see them in the graph
        </p>
        {/* Escape hatch: a stale ?focus= id resolves to an empty local
            neighbourhood — without this the user has no way back. */}
        {scope === "local" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToGlobal}
            className="mt-4 gap-1.5"
          >
            <IconArrowBack size={14} />
            View global graph
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 rounded-lg overflow-hidden">
      <GraphCanvas
        ref={canvasRef}
        nodes={graphNodes}
        edges={graphEdges}
        viewTheme={viewTheme}
        settings={graphSettings}
        focusNodeId={resolvedFocusNodeId ?? focusNodeId}
        searchMatchSet={searchMatchSet}
        isSearchActive={isSearchActive}
        showLabels={graphSettings.showLabels}
        onHoverNode={handleHoverNode}
        onHoverEdge={setHoveredEdge}
        onClickNode={handleClickNode}
        onLinkNodes={handleLinkNodes}
        onFocusNode={handleFocusNode}
      />

      {/* Nav controls (zoom) */}
      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      {/* Local-scope controls: switch to global + neighbourhood depth */}
      {scope === "local" && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToGlobal}
            className="bg-surface-secondary/40 gap-1.5"
          >
            <IconArrowBack size={14} />
            Global graph
          </Button>
          <div className="flex items-center gap-0.5 rounded-lg bg-surface-secondary/40 p-0.5">
            <span className="px-1.5 text-xs text-muted">Depth</span>
            {LOCAL_GRAPH_DEPTHS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDepthChange(d)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-[background-color]",
                  d === depth
                    ? "bg-surface-tertiary text-foreground"
                    : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Global-scope loading indicator: honest about the loaded subset
          (newest-first pages) instead of silently truncating at the cap. */}
      {scope === "global" &&
        totalMemoryCount !== null &&
        loadedMemoryCount < totalMemoryCount && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-lg bg-surface-secondary/40 py-1 pl-3 pr-1">
            <span className="text-xs text-muted tabular-nums">
              Showing {loadedMemoryCount.toLocaleString()} of{" "}
              {totalMemoryCount.toLocaleString()} memories
            </span>
            {canLoadMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="h-6 px-2 text-xs"
              >
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        )}

      {/* Tooltip near node */}
      {hoveredNode && !selectedNodeId && (
        <GraphNodeTooltip
          title={hoveredNode.title}
          viewportX={hoveredNode.viewportX}
          viewportY={hoveredNode.viewportY}
        />
      )}

      {/* Edge tooltip — shown only when no node is hovered/selected so the
          node tooltip takes visual precedence. */}
      {hoveredEdge && !selectedNodeId && !hoveredNode && (
        <GraphEdgeTooltip
          edgeType={hoveredEdge.edgeType}
          sourceTitle={hoveredEdge.sourceTitle}
          targetTitle={hoveredEdge.targetTitle}
          reason={hoveredEdge.reason}
          score={hoveredEdge.score}
          viewportX={hoveredEdge.viewportX}
          viewportY={hoveredEdge.viewportY}
        />
      )}

      {/* Right detail panel */}
      <GraphDetailPanel
        nodeData={selectedNodeData}
        relatedNodes={relatedNodes}
        onClose={handleCloseDetail}
        onNavigate={handleNavigateNode}
        onDelete={deleteMemory}
        onFocusNode={handleFocusNode}
      />
    </div>
  );
}
