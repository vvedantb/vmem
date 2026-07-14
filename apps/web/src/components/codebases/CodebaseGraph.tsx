"use client";

// codebase symbol-graph canvas

import { useMemo, useCallback, useRef, useState } from "react";
import { IconAlertTriangle, IconMoodEmpty } from "@tabler/icons-react";
import GraphCanvas from "@/components/_components/GraphCanvas";
import { VmemSpinner } from "@/components/svg-animations";
import type { GraphCanvasHandle } from "@/components/_components/GraphCanvas";
import GraphNavControls from "@/components/_components/GraphNavControls";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";
import GraphEdgeTooltip from "@/components/_components/GraphEdgeTooltip";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import {
  DEFAULT_GRAPH_SETTINGS,
  type HoveredEdgeInfo,
  type HoveredNodeInfo,
} from "@/components/_components/graph-types";
import { CodebaseSymbolPanel } from "./CodebaseSymbolPanel";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";

// canvas requires onLinkNodes; codebase graphs are structural (no manual links)
function noopLinkNodes(_sourceId: string, _targetId: string) {}

interface CodebaseGraphProps {
  codebaseId: string;
  controller: CodebaseGraphController;
}

export function CodebaseGraph({ codebaseId, controller }: CodebaseGraphProps) {
  const canvasRef = useRef<GraphCanvasHandle>(null);

  const {
    apiNodes,
    truncated,
    isLoading,
    isError,
    error,
    graphNodes,
    graphEdges,
    searchMatchSet,
    hasActiveSearch,
    isDark,
    selectedSymbolId,
    blastDirection,
    onSelectSymbol,
    onToggleBlastDirection,
  } = controller;

  // hovered-node / hovered-edge state stays canvas-local: it's high-
  // frequency and not worth putting in the controller (or the URL)
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);

  const viewTheme = useMemo(() => getViewTheme(isDark), [isDark]);

  const handleClickNode = useCallback(
    (nodeId: string) => {
      onSelectSymbol(nodeId);
      setHoveredNode(null);
    },
    [onSelectSymbol],
  );

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
        <IconMoodEmpty className="w-8 h-8 text-muted mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">
          Failed to load graph
        </p>
        <p className="text-xs text-muted max-w-sm">
          {error?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  if (apiNodes.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <IconMoodEmpty className="w-8 h-8 text-muted mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">
          No symbols to visualise
        </p>
        <p className="text-xs text-muted">
          Sync the repository to see its symbol graph.
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
        isSearchActive={hasActiveSearch}
        showLabels={DEFAULT_GRAPH_SETTINGS.showLabels}
        onHoverNode={setHoveredNode}
        onHoverEdge={setHoveredEdge}
        onClickNode={handleClickNode}
        onLinkNodes={noopLinkNodes}
      />

      {/* Stats badge (top-right) */}
      <div className="absolute top-2 right-2 z-10 hidden md:block">
        <div className="text-[10px] text-muted bg-surface-secondary/40 rounded px-2 py-1">
          {graphNodes.length} symbols / {graphEdges.length} edges
        </div>
      </div>

      {/* Truncation banner — server caps the payload at 8192 entries to
          fit Convex's action limit. Show this so the user knows the graph
          isn't the full picture and can narrow down via filters. */}
      {truncated && (
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 max-w-md px-3">
          <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground">
            <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              Graph too large to fully display — showing a representative slice.
              Apply filters (kinds, process, blast radius) to narrow down.
            </span>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      {/* Hover tooltips — node takes priority when both are present, and
          we suppress them entirely while a symbol is selected so they
          don't fight the detail panel for attention. */}
      {hoveredNode && !selectedSymbolId && (
        <GraphNodeTooltip
          title={hoveredNode.title}
          viewportX={hoveredNode.viewportX}
          viewportY={hoveredNode.viewportY}
        />
      )}
      {hoveredEdge && !selectedSymbolId && !hoveredNode && (
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

      {/* Right-side detail panel — visible whenever a symbol is selected
          (`blastRadiusOf` URL param). The graph filters to that symbol's
          blast radius automatically because the API call uses the same
          param, so the panel and canvas stay in sync. */}
      <CodebaseSymbolPanel
        codebaseId={codebaseId}
        selectedSymbolId={selectedSymbolId}
        blastDirection={blastDirection}
        onClose={() => onSelectSymbol(null)}
        onSelectSymbol={onSelectSymbol}
        onToggleBlastDirection={onToggleBlastDirection}
      />
    </div>
  );
}
