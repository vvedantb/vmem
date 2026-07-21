// force-directed graph canvas + canvas-local overlays (filters live in controller)

import { useRef } from "react";
import { Button } from "@vmem/ui";
import { useMemoryContext } from "@/contexts/MemoryContext";
import GraphCanvas from "@/components/_components/GraphCanvas";
import type { GraphCanvasHandle } from "@/components/_components/GraphCanvas";
import GraphNavControls from "@/components/_components/GraphNavControls";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";
import GraphEdgeTooltip from "@/components/_components/GraphEdgeTooltip";
import GraphDetailPanel from "@/components/_components/GraphDetailPanel";
import { GraphStatus } from "@/components/_components/GraphStatus";
import { useGraphNodeInteraction } from "@/hooks/useGraphNodeInteraction";
import type { MemoryGraphController } from "@/hooks/useMemoryGraphController";

interface MemoryGraphProps {
  controller: MemoryGraphController;
  // deep-link highlight on the global graph (does not change the fetch)
  focusNodeId?: string | null;
}

export default function MemoryGraph({
  controller,
  focusNodeId = null,
}: MemoryGraphProps) {
  const { deleteMemory } = useMemoryContext();
  const canvasRef = useRef<GraphCanvasHandle>(null);

  const {
    apiNodes,
    graphNodes,
    graphEdges,
    graphSettings,
    viewTheme,
    searchMatchSet,
    isSearchActive,
    loadedMemoryCount,
    loadedRelationshipCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore,
    fetchNextPage,
    isLoading,
    isError,
    error,
  } = controller;

  const interaction = useGraphNodeInteraction({
    graphNodes,
    graphEdges,
  });

  if (isLoading) {
    return <GraphStatus variant="loading" />;
  }

  if (isError) {
    return (
      <GraphStatus
        variant="error"
        title="Failed to load graph"
        description={error?.message}
      />
    );
  }

  if (apiNodes.length === 0) {
    return (
      <GraphStatus
        variant="empty"
        title="No memories to visualize"
        description="Add some memories to see them in the graph"
      />
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg">
      <GraphCanvas
        ref={canvasRef}
        nodes={graphNodes}
        edges={graphEdges}
        viewTheme={viewTheme}
        focusNodeId={focusNodeId}
        searchMatchSet={searchMatchSet}
        isSearchActive={isSearchActive}
        showLabels={graphSettings.showLabels}
        onHoverNode={interaction.setHoveredNode}
        onHoverEdge={interaction.setHoveredEdge}
        onClickNode={interaction.handleClickNode}
      />

      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-lg bg-surface-secondary/40 py-1 pr-1 pl-3">
        <span className="text-xs text-muted tabular-nums">
          {totalMemoryCount !== null && loadedMemoryCount < totalMemoryCount ? (
            <>
              Showing {loadedMemoryCount.toLocaleString()} of{" "}
              {totalMemoryCount.toLocaleString()} memories
            </>
          ) : totalMemoryCount !== null ? (
            <>{totalMemoryCount.toLocaleString()} memories</>
          ) : (
            <>{loadedMemoryCount.toLocaleString()} memories</>
          )}
          {" · "}
          {loadedRelationshipCount.toLocaleString()} relationships
        </span>
        {canLoadMore ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNextPage}
            disabled={isLoadingMore}
            className="h-6 px-2 text-xs"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </div>

      {interaction.hoveredNode && !interaction.selectedNodeId ? (
        <GraphNodeTooltip
          title={interaction.hoveredNode.title}
          viewportX={interaction.hoveredNode.viewportX}
          viewportY={interaction.hoveredNode.viewportY}
        />
      ) : null}

      {interaction.hoveredEdge &&
      !interaction.selectedNodeId &&
      !interaction.hoveredNode ? (
        <GraphEdgeTooltip
          edgeType={interaction.hoveredEdge.edgeType}
          sourceTitle={interaction.hoveredEdge.sourceTitle}
          targetTitle={interaction.hoveredEdge.targetTitle}
          reason={interaction.hoveredEdge.reason}
          score={interaction.hoveredEdge.score}
          viewportX={interaction.hoveredEdge.viewportX}
          viewportY={interaction.hoveredEdge.viewportY}
        />
      ) : null}

      <GraphDetailPanel
        nodeData={interaction.selectedNodeData}
        relatedNodes={interaction.relatedNodes}
        onClose={interaction.handleCloseDetail}
        onNavigate={interaction.handleNavigateNode}
        onDelete={deleteMemory}
      />
    </div>
  );
}
