"use client";

/**
 * Codebase file dependency graph — orchestrates the canvas, tooltip, and
 * detail panel. Filter/search chrome now lives in the page header; this
 * component consumes filtered/derived state via a controller prop.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { IconLoader2, IconMoodEmpty } from "@tabler/icons-react";
import GraphCanvas from "@/components/_components/GraphCanvas";
import type { GraphCanvasHandle } from "@/components/_components/GraphCanvas";
import GraphNavControls from "@/components/_components/GraphNavControls";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import {
  DEFAULT_GRAPH_SETTINGS,
  type HoveredNodeInfo,
} from "@/components/_components/graph-types";
import { getRelatedFiles } from "./codebase-graph-data";
import { CodebaseDetailPanel } from "./CodebaseDetailPanel";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";

interface CodebaseGraphProps {
  controller: CodebaseGraphController;
}

export function CodebaseGraph({ controller }: CodebaseGraphProps) {
  const canvasRef = useRef<GraphCanvasHandle>(null);

  const {
    apiNodes,
    isLoading,
    isError,
    error,
    graphNodes,
    graphEdges,
    searchMatchSet,
    isDark,
  } = controller;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);

  const viewTheme = useMemo(() => getViewTheme("default", isDark), [isDark]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graphNodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    // Codebase nodes always populate `content` with the file path (see
    // codebase-graph-data.buildCodebaseGraphData). The `?? ""` is only here
    // because `GraphNode.content` was made optional to support lazy-loading
    // memory bodies — codebase data never actually produces undefined.
    return {
      id: node.id,
      filename: node.title,
      path: node.content ?? "",
      directory: node.tags[0] ?? "",
    };
  }, [selectedNodeId, graphNodes]);

  const relatedFiles = useMemo(() => {
    if (!selectedNodeId) return [];
    return getRelatedFiles(selectedNodeId, graphEdges, graphNodes);
  }, [selectedNodeId, graphEdges, graphNodes]);

  const handleHoverNode = useCallback((info: HoveredNodeInfo | null) => {
    setHoveredNode(info);
  }, []);

  const handleClickNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setHoveredNode(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigateNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // No-op for link nodes — codebase graph doesn't support manual linking
  const handleLinkNodes = useCallback(
    (_sourceId: string, _targetId: string) => {},
    [],
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <IconMoodEmpty className="w-8 h-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">
          Failed to load graph
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {error?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  if (apiNodes.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <IconMoodEmpty className="w-8 h-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">
          No files to visualize
        </p>
        <p className="text-xs text-muted-foreground">
          Sync the repository to see its file dependency graph.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <GraphCanvas
        ref={canvasRef}
        nodes={graphNodes}
        edges={graphEdges}
        viewTheme={viewTheme}
        settings={DEFAULT_GRAPH_SETTINGS}
        focusNodeId={null}
        searchMatchSet={searchMatchSet}
        showLabels={DEFAULT_GRAPH_SETTINGS.showLabels}
        onHoverNode={handleHoverNode}
        onClickNode={handleClickNode}
        onLinkNodes={handleLinkNodes}
      />

      {/* Stats badge (top-right) */}
      <div className="absolute top-2 right-2 z-10 hidden md:block">
        <div className="text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm rounded px-2 py-1 border border-border/30">
          {graphNodes.length} files / {graphEdges.length} imports
        </div>
      </div>

      {/* Zoom controls */}
      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      {/* Hover tooltip */}
      {hoveredNode && !selectedNodeId && (
        <GraphNodeTooltip
          title={hoveredNode.title}
          viewportX={hoveredNode.viewportX}
          viewportY={hoveredNode.viewportY}
        />
      )}

      {/* File detail panel (right side) */}
      <CodebaseDetailPanel
        nodeData={selectedNodeData}
        relatedFiles={relatedFiles}
        onClose={handleCloseDetail}
        onNavigate={handleNavigateNode}
      />
    </div>
  );
}
