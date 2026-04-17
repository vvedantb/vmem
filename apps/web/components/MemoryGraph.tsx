"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAction } from "convex/react";
import {
  IconMoodEmpty,
  IconLoader2,
  IconPlus,
  IconArrowBack,
} from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import AddMemoryModal from "@/components/AddMemoryModal";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useGraphData } from "@/hooks/useGraphData";
import { api } from "@vmem/backend";
import {
  getGraphSettings,
  setGraphSettings,
  getGraphViewMode,
  setGraphViewMode,
} from "@/lib/graph-cookies";
import type { HoveredNodeInfo, GraphSettings } from "./_components/graph-types";
import type { ViewMode } from "./_components/graph-view-themes";
import { getViewTheme } from "./_components/graph-view-themes";
import {
  buildGraphData,
  getAllTags,
  getRelatedNodes,
} from "./_components/graph-data";
import GraphCanvas from "./_components/GraphCanvas";
import type { GraphCanvasHandle } from "./_components/GraphCanvas";
import GraphControlPanel from "./_components/GraphControlPanel";
import GraphNavControls from "./_components/GraphNavControls";
import GraphNodeTooltip from "./_components/GraphNodeTooltip";
import GraphDetailPanel from "./_components/GraphDetailPanel";

interface MemoryGraphProps {
  focusNodeId: string | null;
  onFocusChange: (id: string | null) => void;
}

const EMPTY_SET = new Set<string>();

export default function MemoryGraph({
  focusNodeId,
  onFocusChange,
}: MemoryGraphProps) {
  const { deleteMemory } = useMemoryContext();
  const { theme } = useThemeContext();
  const linkMemories = useAction(api.relationshipApi.linkMemories);
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // Data
  const {
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    isLoading,
    isError,
    error,
  } = useGraphData(focusNodeId);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);
  const [viewMode, setViewModeState] = useState<ViewMode>(getGraphViewMode);
  const [controlPanelOpen, setControlPanelOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(EMPTY_SET);

  // Derived
  const isDark = theme === "dark";
  const viewTheme = useMemo(
    () => getViewTheme(viewMode, isDark),
    [viewMode, isDark],
  );

  const allTags = useMemo(() => getAllTags(apiNodes), [apiNodes]);

  const { graphNodes, graphEdges } = useMemo(
    () =>
      buildGraphData(
        apiNodes,
        apiTagEdges,
        allRelatesToEdges,
        apiWikiParentEdges,
        activeTags,
      ),
    [apiNodes, apiTagEdges, allRelatesToEdges, apiWikiParentEdges, activeTags],
  );

  const searchMatchSet = useMemo(() => {
    if (search.trim().length === 0) return EMPTY_SET;
    const q = search.trim().toLowerCase();
    const matches = new Set<string>();
    for (const node of graphNodes) {
      if (
        node.title.toLowerCase().includes(q) ||
        node.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        matches.add(node.id);
      }
    }
    return matches;
  }, [search, graphNodes]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graphNodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;
    return {
      id: node.id,
      title: node.title,
      content: node.content,
      tags: node.tags,
      createdAt: node.createdAt,
    };
  }, [selectedNodeId, graphNodes]);

  const relatedNodes = useMemo(() => {
    if (!selectedNodeId) return [];
    return getRelatedNodes(selectedNodeId, graphEdges, graphNodes);
  }, [selectedNodeId, graphEdges, graphNodes]);

  // Handlers
  const handleSettingsChange = useCallback((next: GraphSettings) => {
    setGraphSettingsState(next);
    setGraphSettings(next);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setGraphViewMode(mode);
  }, []);

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

  const handleToggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const handleSelectAllTags = useCallback(() => {
    setActiveTags(EMPTY_SET);
  }, []);

  const handleClearAllTags = useCallback(() => {
    setActiveTags((prev) => {
      // If already all selected (empty = show all), select none instead
      if (prev.size === 0) {
        return new Set(["__NONE__"]); // sentinel: no tags match -> empty graph
      }
      return EMPTY_SET;
    });
  }, []);

  // Loading / error / empty states
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
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Failed to load graph
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {error?.message}
        </p>
      </div>
    );
  }

  if (apiNodes.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No memories to visualize
        </h3>
        <p className="text-sm text-muted-foreground">
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
        showLabels={graphSettings.showLabels}
        onHoverNode={handleHoverNode}
        onClickNode={handleClickNode}
        onLinkNodes={handleLinkNodes}
        onFocusNode={handleFocusNode}
      />

      {/* Left control panel */}
      <GraphControlPanel
        open={controlPanelOpen}
        onToggle={() => setControlPanelOpen((p) => !p)}
        search={search}
        onSearchChange={setSearch}
        allTags={allTags}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        onSelectAllTags={handleSelectAllTags}
        onClearAllTags={handleClearAllTags}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        settings={graphSettings}
        onSettingsChange={handleSettingsChange}
        totalNodeCount={apiNodes.length}
        visibleNodeCount={graphNodes.length}
        edgeCount={graphEdges.length}
        isDark={isDark}
        isDarkCanvas={viewTheme.isDarkCanvas}
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
        <div className="absolute top-2 left-14 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToGlobal}
            className="bg-background/80 backdrop-blur-sm gap-1.5"
          >
            <IconArrowBack size={14} />
            Global graph
          </Button>
        </div>
      )}

      {/* Add memory */}
      <div className="absolute top-2 right-2 z-10">
        <AddMemoryModal
          trigger={
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            >
              <IconPlus size={16} />
            </Button>
          }
        />
      </div>

      {/* Tooltip near node */}
      {hoveredNode && !selectedNodeId && (
        <GraphNodeTooltip
          title={hoveredNode.title}
          content={hoveredNode.content}
          viewportX={hoveredNode.viewportX}
          viewportY={hoveredNode.viewportY}
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
