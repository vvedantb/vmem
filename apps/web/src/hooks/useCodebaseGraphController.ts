"use client";

/**
 * Codebase-graph controller hook.
 *
 * Owns the data + filter/search state for a single codebase's file graph so
 * both the canvas (`CodebaseGraph`) and the page-header popovers
 * (`CodebaseGraphHeaderControls`) read from one source.
 */

import { useCallback, useMemo, useState } from "react";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import {
  useCodebaseGraphData,
  type CodeFileNode,
  type ImportEdge,
} from "@/hooks/useCodebaseGraphData";
import {
  buildCodebaseGraphData,
  getAllDirectories,
  type DirectoryStat,
} from "@/components/codebases/codebase-graph-data";
import type {
  GraphNode,
  GraphEdge,
} from "@/components/_components/canvas/types";

const EMPTY_SET: Set<string> = new Set<string>();
const NONE_SENTINEL = "__NONE__";

export interface CodebaseGraphController {
  // Raw
  apiNodes: CodeFileNode[];
  apiEdges: ImportEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;

  // Derived
  directories: DirectoryStat[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  searchMatchSet: Set<string>;
  totalFileCount: number;
  visibleFileCount: number;
  edgeCount: number;
  hasActiveSearch: boolean;
  hasActiveDirectoryFilter: boolean;

  // Filter state
  activeDirectories: Set<string>;

  // Search
  search: string;

  // Display
  isDark: boolean;

  // Handlers
  onSearchChange: (q: string) => void;
  onToggleDirectory: (dir: string) => void;
  onSelectAllDirs: () => void;
  onClearAllDirs: () => void;
}

export function useCodebaseGraphController(
  codebaseId: string,
): CodebaseGraphController {
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const {
    nodes: apiNodes,
    edges: apiEdges,
    isLoading,
    isError,
    error,
  } = useCodebaseGraphData(codebaseId);

  const [search, setSearch] = useState("");
  const [activeDirectories, setActiveDirectories] = useState<Set<string>>(
    () => new Set(),
  );

  const directories = useMemo(() => getAllDirectories(apiNodes), [apiNodes]);

  const { graphNodes, graphEdges } = useMemo(
    () => buildCodebaseGraphData(apiNodes, apiEdges, activeDirectories),
    [apiNodes, apiEdges, activeDirectories],
  );

  const searchMatchSet = useMemo<Set<string>>(() => {
    if (search.trim().length === 0) return EMPTY_SET;
    const q = search.trim().toLowerCase();
    const matches = new Set<string>();
    for (const node of graphNodes) {
      // Codebase nodes inline the file path into `content`. It's optional on
      // the shared GraphNode type (memory graph lazy-loads its content) so
      // we coalesce here; in practice this branch always reads a real path.
      const path = node.content ?? "";
      if (
        node.title.toLowerCase().includes(q) ||
        path.toLowerCase().includes(q)
      ) {
        matches.add(node.id);
      }
    }
    return matches;
  }, [search, graphNodes]);

  const hasActiveSearch = search.trim().length > 0;
  // Empty set = "show all", so anything non-empty is a narrowing filter.
  const hasActiveDirectoryFilter = activeDirectories.size > 0;

  const onSearchChange = useCallback((q: string) => setSearch(q), []);

  const onToggleDirectory = useCallback((dir: string) => {
    setActiveDirectories((prev) => {
      const next = new Set(prev);
      // A prior "none" state is represented by a single sentinel — drop it
      // before honouring an explicit directory toggle.
      next.delete(NONE_SENTINEL);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  const onSelectAllDirs = useCallback(() => {
    setActiveDirectories(new Set());
  }, []);

  const onClearAllDirs = useCallback(() => {
    // Sentinel that matches no real directory → forces empty graph.
    setActiveDirectories(new Set([NONE_SENTINEL]));
  }, []);

  return {
    apiNodes,
    apiEdges,
    isLoading,
    isError,
    error,
    directories,
    graphNodes,
    graphEdges,
    searchMatchSet,
    totalFileCount: apiNodes.length,
    visibleFileCount: graphNodes.length,
    edgeCount: graphEdges.length,
    hasActiveSearch,
    hasActiveDirectoryFilter,
    activeDirectories,
    search,
    isDark,
    onSearchChange,
    onToggleDirectory,
    onSelectAllDirs,
    onClearAllDirs,
  };
}
