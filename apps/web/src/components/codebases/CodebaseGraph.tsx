// codebase symbol graph canvas

import { useRef, useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import GraphCanvas from "@/components/_components/GraphCanvas";
import type { GraphCanvasHandle } from "@/components/_components/GraphCanvas";
import GraphNavControls from "@/components/_components/GraphNavControls";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";
import GraphEdgeTooltip from "@/components/_components/GraphEdgeTooltip";
import { GraphStatus } from "@/components/_components/GraphStatus";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import {
  DEFAULT_GRAPH_SETTINGS,
  type HoveredEdgeInfo,
  type HoveredNodeInfo,
} from "@/lib/graph/graph-types";
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

  // hovered-node / hovered-edge state stays canvas-local: high-frequency,
  // not worth the controller (or URL)
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);

  const viewTheme = getViewTheme(isDark);

  const handleClickNode = (nodeId: string) => {
    onSelectSymbol(nodeId);
    setHoveredNode(null);
  };

  if (isLoading) {
    return <GraphStatus variant="loading" />;
  }

  if (isError) {
    return (
      <GraphStatus
        variant="error"
        title="Failed to load graph"
        description={error?.message ?? "Unknown error"}
      />
    );
  }

  if (apiNodes.length === 0) {
    return (
      <GraphStatus
        variant="empty"
        title="No symbols to visualise"
        description="Sync the repository to see its symbol graph."
      />
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <GraphCanvas
        ref={canvasRef}
        nodes={graphNodes}
        edges={graphEdges}
        viewTheme={viewTheme}
        focusNodeId={null}
        searchMatchSet={searchMatchSet}
        isSearchActive={hasActiveSearch}
        showLabels={DEFAULT_GRAPH_SETTINGS.showLabels}
        onHoverNode={setHoveredNode}
        onHoverEdge={setHoveredEdge}
        onClickNode={handleClickNode}
      />

      {
        // stats badge (top, right)
      }
      <div className="absolute top-2 right-2 z-10 hidden md:block">
        <div className="text-[10px] text-muted bg-surface-secondary/40 rounded px-2 py-1">
          {graphNodes.length} symbols / {graphEdges.length} edges
        </div>
      </div>

      {
        // truncation banner: server caps payload at 8192 entries (Convex action limit).
        // shown so users know the graph is sliced and can narrow via filters.
      }
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

      {
        // zoom controls
      }
      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      {
        // hover tooltips — node wins when both present, suppressed while a symbol is
        // selected so they don't fight the detail panel
      }
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

      {
        // right-side detail panel when a symbol is selected (`blastRadiusOf` URL param).
        // graph filters to that blast radius via the same API param so panel + canvas stay in sync.
      }
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
