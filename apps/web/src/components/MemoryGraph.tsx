"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAction } from "convex/react";
import { useQueryStates } from "nuqs";
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
import type { MemoryType } from "@/lib/memories";
import { memoriesSearchParams } from "@/routes/_main/memories/-searchParams";
import type { HoveredNodeInfo, GraphSettings } from "./_components/graph-types";
import type { ViewMode } from "./_components/graph-view-themes";
import { getViewTheme } from "./_components/graph-view-themes";
import type { GraphNodeKind } from "./_components/canvas/types";
import {
  buildGraphData,
  getAllTags,
  getAllKinds,
  getAllSources,
  getAllTypes,
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

/**
 * Default kind filter shows every known kind. We seed the set with all four
 * (rather than only present kinds) so a user's first wiki doc, folder, or
 * skill appears automatically without them having to re-enable the filter.
 */
const DEFAULT_ACTIVE_KINDS: ReadonlySet<GraphNodeKind> = new Set<GraphNodeKind>(
  ["memory", "wiki-document", "wiki-folder", "skill"],
);

export default function MemoryGraph({
  focusNodeId,
  onFocusChange,
}: MemoryGraphProps) {
  const { deleteMemory } = useMemoryContext();
  const { theme } = useThemeContext();
  const linkMemories = useAction(api.relationshipApi.linkMemories);
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // URL-backed filter state — shared with the list view via nuqs so filters
  // persist when switching view modes or across sessions.
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  // Data
  const {
    apiNodes,
    apiTagEdges,
    allRelatesToEdges,
    apiWikiParentEdges,
    isLoading,
    isError,
    error,
  } = useGraphData(focusNodeId, params.profile);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [graphSettings, setGraphSettingsState] =
    useState<GraphSettings>(getGraphSettings);
  const [viewMode, setViewModeState] = useState<ViewMode>(getGraphViewMode);
  const [controlPanelOpen, setControlPanelOpen] = useState(true);
  const [search, setSearch] = useState("");

  // Adapt nuqs arrays ↔ Sets once; buildGraphData / handlers downstream still
  // want Set semantics. An empty `kinds` param means "all kinds" so a fresh
  // URL shows everything.
  const activeTags = useMemo(() => new Set(params.tags), [params.tags]);
  const activeKinds = useMemo<Set<GraphNodeKind>>(
    () =>
      params.kinds.length > 0
        ? new Set(params.kinds)
        : new Set(DEFAULT_ACTIVE_KINDS),
    [params.kinds],
  );
  const activeSources = useMemo(
    () => new Set(params.sources),
    [params.sources],
  );
  const activeTypes = useMemo<Set<MemoryType>>(
    () => new Set(params.types),
    [params.types],
  );

  // Derived
  const isDark = theme === "dark";
  const viewTheme = useMemo(
    () => getViewTheme(viewMode, isDark),
    [viewMode, isDark],
  );

  const allTags = useMemo(() => getAllTags(apiNodes), [apiNodes]);
  const allKinds = useMemo(() => getAllKinds(apiNodes), [apiNodes]);
  const allSources = useMemo(() => getAllSources(apiNodes), [apiNodes]);
  const allTypes = useMemo(() => getAllTypes(apiNodes), [apiNodes]);

  const { graphNodes, graphEdges } = useMemo(
    () =>
      buildGraphData(
        apiNodes,
        apiTagEdges,
        allRelatesToEdges,
        apiWikiParentEdges,
        activeTags,
        activeKinds,
        activeSources,
        activeTypes,
      ),
    [
      apiNodes,
      apiTagEdges,
      allRelatesToEdges,
      apiWikiParentEdges,
      activeTags,
      activeKinds,
      activeSources,
      activeTypes,
    ],
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

  const handleToggleTag = useCallback(
    (tag: string) => {
      const next = params.tags.includes(tag)
        ? params.tags.filter((t) => t !== tag)
        : [...params.tags, tag];
      void setParams({ tags: next });
    },
    [params.tags, setParams],
  );

  // Kind filter stays aligned with list-view semantics: an empty `kinds` array
  // in the URL means "all kinds visible" (handled at read time via the
  // activeKinds memo). Toggling off every kind results in an empty array,
  // which then widens back to "show all" — matches how nuqs filters work
  // everywhere else in the app.
  const handleToggleKind = useCallback(
    (kind: GraphNodeKind) => {
      // If url is empty (all-visible), toggling one off means "show all except this one".
      const current =
        params.kinds.length > 0
          ? params.kinds
          : Array.from(DEFAULT_ACTIVE_KINDS);
      const next = current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind];
      void setParams({ kinds: next });
    },
    [params.kinds, setParams],
  );

  const handleToggleSource = useCallback(
    (source: string) => {
      const next = params.sources.includes(source)
        ? params.sources.filter((s) => s !== source)
        : [...params.sources, source];
      void setParams({ sources: next });
    },
    [params.sources, setParams],
  );

  const handleToggleType = useCallback(
    (type: MemoryType) => {
      const next = params.types.includes(type)
        ? params.types.filter((t) => t !== type)
        : [...params.types, type];
      void setParams({ types: next });
    },
    [params.types, setParams],
  );

  const handleProfileChange = useCallback(
    (profile: string | null) => {
      void setParams({ profile });
    },
    [setParams],
  );

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
        profileId={params.profile}
        onProfileChange={handleProfileChange}
        allKinds={allKinds}
        activeKinds={activeKinds}
        onToggleKind={handleToggleKind}
        allTags={allTags}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        allSources={allSources}
        activeSources={activeSources}
        onToggleSource={handleToggleSource}
        allTypes={allTypes}
        activeTypes={activeTypes}
        onToggleType={handleToggleType}
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
