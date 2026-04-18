"use client";

/**
 * Codebase file dependency graph — orchestrates the canvas, directory filter,
 * search, tooltip, and detail panel. Mirrors the MemoryGraph pattern but
 * scoped to a single codebase's file imports.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { IconLoader2, IconMoodEmpty, IconSearch } from "@tabler/icons-react";
import { Input } from "@vmem/ui";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useCodebaseGraphData } from "@/hooks/useCodebaseGraphData";
import GraphCanvas from "@/components/_components/GraphCanvas";
import type { GraphCanvasHandle } from "@/components/_components/GraphCanvas";
import GraphNavControls from "@/components/_components/GraphNavControls";
import GraphNodeTooltip from "@/components/_components/GraphNodeTooltip";
import { getViewTheme } from "@/components/_components/graph-view-themes";
import {
  DEFAULT_GRAPH_SETTINGS,
  type HoveredNodeInfo,
} from "@/components/_components/graph-types";
import {
  buildCodebaseGraphData,
  getAllDirectories,
  getRelatedFiles,
} from "./codebase-graph-data";
import { DirectoryFilter } from "./DirectoryFilter";
import { CodebaseDetailPanel } from "./CodebaseDetailPanel";

interface CodebaseGraphProps {
  codebaseId: string;
}

const EMPTY_SET = new Set<string>();

export function CodebaseGraph({ codebaseId }: CodebaseGraphProps) {
  const { theme } = useThemeContext();
  const canvasRef = useRef<GraphCanvasHandle>(null);

  // Fetch raw API data
  const {
    nodes: apiNodes,
    edges: apiEdges,
    isLoading,
    isError,
    error,
  } = useCodebaseGraphData(codebaseId);

  // UI state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeInfo | null>(null);
  const [search, setSearch] = useState("");
  const [activeDirectories, setActiveDirectories] =
    useState<Set<string>>(EMPTY_SET);

  // Derived
  const isDark = theme === "dark";
  const viewTheme = useMemo(() => getViewTheme("default", isDark), [isDark]);

  const directories = useMemo(() => getAllDirectories(apiNodes), [apiNodes]);

  const { graphNodes, graphEdges } = useMemo(
    () => buildCodebaseGraphData(apiNodes, apiEdges, activeDirectories),
    [apiNodes, apiEdges, activeDirectories],
  );

  const searchMatchSet = useMemo(() => {
    if (search.trim().length === 0) return EMPTY_SET;
    const q = search.trim().toLowerCase();
    const matches = new Set<string>();
    for (const node of graphNodes) {
      if (
        node.title.toLowerCase().includes(q) ||
        node.content.toLowerCase().includes(q) // content = full file path
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
      filename: node.title,
      path: node.content,
      directory: node.tags[0] ?? "",
    };
  }, [selectedNodeId, graphNodes]);

  const relatedFiles = useMemo(() => {
    if (!selectedNodeId) return [];
    return getRelatedFiles(selectedNodeId, graphEdges, graphNodes);
  }, [selectedNodeId, graphEdges, graphNodes]);

  // Handlers
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

  const handleToggleDirectory = useCallback((dir: string) => {
    setActiveDirectories((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  }, []);

  const handleSelectAllDirs = useCallback(() => {
    setActiveDirectories(EMPTY_SET);
  }, []);

  const handleClearAllDirs = useCallback(() => {
    // Set to a sentinel that matches nothing — forces empty graph
    setActiveDirectories(new Set(["__NONE__"]));
  }, []);

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

      {/* Search + directory filter panel (top-left) */}
      <div className="absolute top-2 left-2 z-10 w-56 flex flex-col gap-2 hidden md:flex">
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="h-8 pl-8 text-xs bg-background/80 backdrop-blur-sm"
          />
        </div>
        <DirectoryFilter
          directories={directories}
          activeDirectories={activeDirectories}
          onToggle={handleToggleDirectory}
          onSelectAll={handleSelectAllDirs}
          onClearAll={handleClearAllDirs}
          isDark={isDark}
        />
      </div>

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
          content={hoveredNode.content}
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
