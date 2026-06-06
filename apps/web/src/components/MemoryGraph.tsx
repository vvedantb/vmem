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
import { Button } from "@vmem/ui";
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
  focusNodeId: string | null;
  onFocusChange: (id: string | null) => void;
}

export default function MemoryGraph({
  controller,
  focusNodeId,
  onFocusChange,
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
      onFocusChange(nodeId);
      setSelectedNodeId(null);
    },
    [onFocusChange],
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
        <h3 className="text-lg font-medium text-foreground mb-2">
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
        <h3 className="text-lg font-medium text-foreground mb-2">
          No memories to visualize
        </h3>
        <p className="text-sm text-muted">
          Add some memories to see them in the graph
        </p>
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
        focusNodeId={focusNodeId}
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

      {/* Back button for focus mode */}
      {focusNodeId && (
        <div className="absolute top-2 left-2 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToGlobal}
            className="bg-surface-secondary/40 gap-1.5"
          >
            <IconArrowBack size={14} />
            Global graph
          </Button>
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
