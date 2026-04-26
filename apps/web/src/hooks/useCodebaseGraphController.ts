"use client";

/**
 * Codebase-graph controller hook.
 *
 * Owns the data + filter/search state for a single codebase's symbol graph
 * (files, functions, classes, interfaces, processes). Both the canvas
 * (`CodebaseGraph`) and the page-header chrome (`CodebaseGraphHeaderControls`)
 * read from the value returned by this hook.
 *
 * State ownership:
 *   - Filters (`kinds`, `processId`, `blastRadiusOf`, `blastDirection`,
 *     `search`): URL via `nuqs` so the view is shareable.
 *   - Active directories: client-side `useState` — purely a presentational
 *     filter applied after the network round-trip, not worth a URL slot.
 *   - Selected-symbol pointer: piggybacks on `blastRadiusOf` so the panel
 *     and the graph stay in sync via a single source of truth.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryStates } from "nuqs";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import {
  useCodebaseGraphData,
  type CodeNode,
  type CodeEdge,
  type CodeNodeKind,
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
import { codebaseSearchParams } from "@/routes/_main/codebases/-searchParams";

const EMPTY_SET: Set<string> = new Set<string>();
const NONE_SENTINEL = "__NONE__";

const DEFAULT_KINDS: CodeNodeKind[] = [
  "code-file",
  "code-function",
  "code-class",
];

/** Cheap deep-equality on string arrays for nuqs default-detection. */
function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const v of b) if (!set.has(v)) return false;
  return true;
}

export interface CodebaseGraphController {
  // ----- Raw data -----
  apiNodes: CodeNode[];
  apiEdges: CodeEdge[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;

  // ----- Derived -----
  directories: DirectoryStat[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  searchMatchSet: Set<string>;
  totalSymbolCount: number;
  visibleSymbolCount: number;
  edgeCount: number;
  hasActiveSearch: boolean;
  hasActiveDirectoryFilter: boolean;
  /** True when any URL-backed filter is non-default. Drives the badge dot. */
  activeFilterCount: number;

  // ----- Filter state -----
  activeKinds: Set<CodeNodeKind>;
  processId: string | null;
  blastRadiusOf: string | null;
  blastDirection: "upstream" | "downstream";
  /** Mirrors `blastRadiusOf` — exposed under a friendly name for the panel. */
  selectedSymbolId: string | null;
  activeDirectories: Set<string>;

  // ----- Search -----
  search: string;

  // ----- Display -----
  isDark: boolean;

  // ----- Handlers -----
  onSearchChange: (q: string) => void;
  onToggleKind: (kind: CodeNodeKind) => void;
  onSetProcess: (id: string | null) => void;
  onSelectSymbol: (id: string | null) => void;
  onToggleBlastDirection: () => void;
  onToggleDirectory: (dir: string) => void;
  onSelectAllDirs: () => void;
  onClearAllDirs: () => void;
  /** Reset every URL-backed filter (kinds/process/blast/search) in one write. */
  onClearFilters: () => void;
}

export function useCodebaseGraphController(
  codebaseId: string,
): CodebaseGraphController {
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const [params, setParams] = useQueryStates(codebaseSearchParams, {
    history: "replace",
  });

  // Adapt nuqs array → Set for membership-style access in the builder /
  // header controls. Memo-keyed on the array reference so toggles don't
  // re-create the set every render.
  const activeKinds = useMemo<Set<CodeNodeKind>>(
    () => new Set(params.kinds),
    [params.kinds],
  );

  // Kinds filtering happens client-side in `buildCodebaseGraphData` so a
  // toggle never round-trips to Neo4j and processes stay listable in the
  // Filters dropdown even when the user has hidden the "code-process" kind
  // from the canvas. The server-side filters (processId / blastRadiusOf)
  // require Cypher traversals so they continue to live in the API call.
  const filters = useMemo(
    () => ({
      processId: params.processId,
      blastRadiusOf: params.blastRadiusOf,
      blastDirection: params.blastDirection,
    }),
    [params.processId, params.blastRadiusOf, params.blastDirection],
  );

  const {
    nodes: apiNodes,
    edges: apiEdges,
    isLoading,
    isError,
    error,
  } = useCodebaseGraphData(codebaseId, filters);

  // Directories list is computed off the raw API payload so toggling a dir
  // doesn't drop options the user hasn't yet picked.
  const directories = useMemo(() => getAllDirectories(apiNodes), [apiNodes]);

  const [activeDirectories, setActiveDirectories] = useState<Set<string>>(
    () => new Set(),
  );

  const { graphNodes, graphEdges } = useMemo(
    () =>
      buildCodebaseGraphData(apiNodes, apiEdges, {
        activeDirectories,
        activeKinds,
      }),
    [apiNodes, apiEdges, activeDirectories, activeKinds],
  );

  const searchMatchSet = useMemo<Set<string>>(() => {
    const q = params.search.trim().toLowerCase();
    if (q.length === 0) return EMPTY_SET;
    const matches = new Set<string>();
    for (const node of graphNodes) {
      // `title` carries the symbol name, `content` carries the file path —
      // both are reasonable hits for a casual "find me X" search.
      const path = node.content ?? "";
      if (
        node.title.toLowerCase().includes(q) ||
        path.toLowerCase().includes(q)
      ) {
        matches.add(node.id);
      }
    }
    return matches;
  }, [params.search, graphNodes]);

  const hasActiveSearch = params.search.trim().length > 0;
  const hasActiveDirectoryFilter = activeDirectories.size > 0;

  // Per CLAUDE.md UI rules: each non-default filter contributes 1, regardless
  // of how many values it carries. Search and directory live outside the
  // Filters dropdown so they don't bump this count.
  const activeFilterCount =
    (sameStringSet(params.kinds, DEFAULT_KINDS) ? 0 : 1) +
    (params.processId ? 1 : 0) +
    (params.blastRadiusOf ? 1 : 0);

  // ----- Handlers -----

  const onSearchChange = useCallback(
    (q: string) => {
      void setParams({ search: q.length === 0 ? "" : q });
    },
    [setParams],
  );

  const onToggleKind = useCallback(
    (kind: CodeNodeKind) => {
      const current = params.kinds;
      const next = current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind];
      void setParams({ kinds: next });
    },
    [params.kinds, setParams],
  );

  const onSetProcess = useCallback(
    (id: string | null) => {
      void setParams({ processId: id });
    },
    [setParams],
  );

  const onSelectSymbol = useCallback(
    (id: string | null) => {
      // Unset any existing process filter when picking a symbol — the two are
      // logically distinct ways to slice the graph and combining them makes
      // the canvas hard to interpret.
      void setParams({
        blastRadiusOf: id,
        processId: id ? null : params.processId,
      });
    },
    [setParams, params.processId],
  );

  const onToggleBlastDirection = useCallback(() => {
    void setParams({
      blastDirection:
        params.blastDirection === "upstream" ? "downstream" : "upstream",
    });
  }, [params.blastDirection, setParams]);

  const onToggleDirectory = useCallback((dir: string) => {
    setActiveDirectories((prev) => {
      const next = new Set(prev);
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
    setActiveDirectories(new Set([NONE_SENTINEL]));
  }, []);

  const onClearFilters = useCallback(() => {
    // One write to avoid the per-field race where successive setParams calls
    // throttle to a single URL update reflecting only the last field.
    void setParams({
      kinds: DEFAULT_KINDS,
      processId: null,
      blastRadiusOf: null,
      blastDirection: "upstream",
    });
  }, [setParams]);

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
    totalSymbolCount: apiNodes.length,
    visibleSymbolCount: graphNodes.length,
    edgeCount: graphEdges.length,
    hasActiveSearch,
    hasActiveDirectoryFilter,
    activeFilterCount,
    activeKinds,
    processId: params.processId,
    blastRadiusOf: params.blastRadiusOf,
    blastDirection: params.blastDirection,
    selectedSymbolId: params.blastRadiusOf,
    activeDirectories,
    search: params.search,
    isDark,
    onSearchChange,
    onToggleKind,
    onSetProcess,
    onSelectSymbol,
    onToggleBlastDirection,
    onToggleDirectory,
    onSelectAllDirs,
    onClearAllDirs,
    onClearFilters,
  };
}
