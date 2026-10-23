// force-directed graph canvas + canvas-local overlays (filters live in controller)

import { useRef } from "react";
import { IconArrowBack, IconRefresh } from "@tabler/icons-react";
import { Button } from "@vvedantb/ui";
import { formatRelativeTime } from "@vmem/shared";
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
  // URL focus-node: when set, controller fetches that node's neighbourhood
  focusNodeId: string | null;
  // id → enter neighbourhood, null → back to global graph
  onFocusChange: (id: string | null) => void;
}

export default function MemoryGraph({
  controller,
  focusNodeId,
  onFocusChange,
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
    isFocused,
    resolvedFocusNodeId,
    loadedMemoryCount,
    loadedRelationshipCount,
    totalMemoryCount,
    canLoadMore,
    isLoadingMore,
    fetchNextPage,
    snapshotBuiltAt,
    snapshotNeedsRefresh,
    isRefreshingSnapshot,
    snapshotRefreshRetryAfterMs,
    refreshSnapshot,
    isLoading,
    isError,
    error,
  } = controller;

  const interaction = useGraphNodeInteraction({
    graphNodes,
    graphEdges,
    onFocusChange,
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
        action={
          isFocused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={interaction.handleBackToGlobal}
              className="mt-4 gap-1.5"
            >
              <IconArrowBack size={14} />
              View global graph
            </Button>
          ) : undefined
        }
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
        focusNodeId={resolvedFocusNodeId ?? focusNodeId}
        searchMatchSet={searchMatchSet}
        isSearchActive={isSearchActive}
        showLabels={graphSettings.showLabels}
        onHoverNode={interaction.setHoveredNode}
        onHoverEdge={interaction.setHoveredEdge}
        onClickNode={interaction.handleClickNode}
        onFocusNode={interaction.handleFocusNode}
      />

      <GraphNavControls
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFit={() => canvasRef.current?.fit()}
        isDarkCanvas={viewTheme.isDarkCanvas}
      />

      {isFocused ? (
        <div className="absolute top-2 left-2 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={interaction.handleBackToGlobal}
            className="gap-1.5 bg-surface-secondary/40"
          >
            <IconArrowBack size={14} />
            Global graph
          </Button>
        </div>
      ) : (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-lg bg-surface-secondary/40 py-1 pr-1 pl-3">
          <span className="text-xs text-muted tabular-nums">
            {totalMemoryCount !== null &&
            loadedMemoryCount < totalMemoryCount ? (
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
          {snapshotBuiltAt !== null ? (
            <>
              <span
                className="text-xs text-muted"
                title={
                  snapshotNeedsRefresh
                    ? "Many changes since the last build. Refresh to see them all."
                    : undefined
                }
              >
                {snapshotRefreshRetryAfterMs !== null
                  ? `Refresh again in ${String(Math.ceil(snapshotRefreshRetryAfterMs / 60_000))} min`
                  : `Updated ${formatRelativeTime(snapshotBuiltAt)}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshSnapshot}
                disabled={isRefreshingSnapshot}
                aria-label="Refresh graph"
                title="Refresh graph"
                className={
                  snapshotNeedsRefresh
                    ? "h-6 px-1.5 text-foreground"
                    : "h-6 px-1.5 text-muted"
                }
              >
                <IconRefresh
                  size={14}
                  className={isRefreshingSnapshot ? "animate-spin" : undefined}
                />
              </Button>
            </>
          ) : null}
        </div>
      )}

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
        onFocusNode={interaction.handleFocusNode}
      />
    </div>
  );
}
