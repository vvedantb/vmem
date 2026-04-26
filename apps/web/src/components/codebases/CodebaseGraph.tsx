"use client";

/**
 * Codebase symbol-graph canvas. Renders the multi-kind payload (files +
 * functions + classes + interfaces + processes) using the shared graph
 * canvas. Filter / search chrome lives in the page header — this component
 * just consumes the controller's derived state.
 *
 * Selection lives in the URL (`?blastRadiusOf=…`) via the controller, so
 * navigating between symbols and refreshing both Just Work without local
 * state management here.
 */

import { useMemo, useCallback, useRef } from "react";
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
import { useState } from "react";
import { CodebaseSymbolPanel } from "./CodebaseSymbolPanel";
import type { CodebaseGraphController } from "@/hooks/useCodebaseGraphController";

interface CodebaseGraphProps {
  codebaseId: string;
  controller: CodebaseGraphController;
}

export function CodebaseGraph({ codebaseId, controller }: CodebaseGraphProps) {
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
    selectedSymbolId,
    blastDirection,
    onSelectSymbol,
    onToggleBlastDirection,
  } = controller;

  // Hovered-node state stays canvas-local: it's high-frequency and not
  // worth putting in the controller (or the URL).
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);

  const viewTheme = useMemo(() => getViewTheme("default", isDark), [isDark]);

  const handleHoverNode = useCallback((info: HoveredNodeInfo | null) => {
    setHoveredNode(info);
  }, []);

  const handleClickNode = useCallback(
    (nodeId: string) => {
      onSelectSymbol(nodeId);
      setHoveredNode(null);
    },
    [onSelectSymbol],
  );

  const handleCloseDetail = useCallback(() => {
    onSelectSymbol(null);
  }, [onSelectSymbol]);

  // Codebase graph doesn't support manual link creation — symbols are
  // structural. The canvas still asks for this callback though.
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
          No symbols to visualise
        </p>
        <p className="text-xs text-muted-foreground">
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
        showLabels={DEFAULT_GRAPH_SETTINGS.showLabels}
        onHoverNode={handleHoverNode}
        onClickNode={handleClickNode}
        onLinkNodes={handleLinkNodes}
      />

      {/* Stats badge (top-right) */}
      <div className="absolute top-2 right-2 z-10 hidden md:block">
        <div className="text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm rounded px-2 py-1">
          {graphNodes.length} symbols / {graphEdges.length} edges
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
      {hoveredNode && !selectedSymbolId && (
        <GraphNodeTooltip
          title={hoveredNode.title}
          viewportX={hoveredNode.viewportX}
          viewportY={hoveredNode.viewportY}
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
        onClose={handleCloseDetail}
        onSelectSymbol={onSelectSymbol}
        onToggleBlastDirection={onToggleBlastDirection}
      />
    </div>
  );
}
