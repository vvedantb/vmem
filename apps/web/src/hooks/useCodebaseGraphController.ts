// data + filter state for one codebase symbol graph (filters in url via nuqs)

import { useState } from "react";
import { useQueryStates } from "nuqs";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useCodebaseGraphData } from "@/hooks/useCodebaseGraphData";
import type { CodeNodeKind } from "@/components/codebases/-types";
import {
  buildCodebaseGraphData,
  getAllDirectories,
} from "@/components/codebases/codebase-graph-data";
import { codebaseSearchParams } from "@/lib/url-state/codebases";
import { graphNodeMatchesLocalSearch } from "@/lib/graph/graph-search";

const EMPTY_SET: Set<string> = new Set<string>();
const NONE_SENTINEL = "__NONE__";

const DEFAULT_KINDS: CodeNodeKind[] = [
  "code-file",
  "code-function",
  "code-class",
];

export function useCodebaseGraphController(codebaseId: string) {
  const { isDark } = useThemeContext();

  const [params, setParams] = useQueryStates(codebaseSearchParams, {
    history: "replace",
  });

  // adapt nuqs array → Set for membership-style access in the builder / header controls
  const activeKinds = new Set(params.kinds);

  // kinds filtering happens client-side in `buildCodebaseGraphData` so a toggle never
  const filters = {
    processId: params.processId,
    blastRadiusOf: params.blastRadiusOf,
    blastDirection: params.blastDirection,
  };

  const {
    nodes: apiNodes,
    edges: apiEdges,
    truncated,
    isLoading,
    isError,
    error,
  } = useCodebaseGraphData(codebaseId, filters);

  // directories list is computed off the raw API payload so toggling a dir
  // doesn't drop options the user hasn't yet picked
  const directories = getAllDirectories(apiNodes);

  const [activeDirectories, setActiveDirectories] = useState<Set<string>>(
    () => new Set(),
  );

  const { graphNodes, graphEdges } = buildCodebaseGraphData(
    apiNodes,
    apiEdges,
    {
      activeDirectories,
      activeKinds,
    },
  );

  const searchMatchSet = (() => {
    const q = params.search.trim();
    if (q.length === 0) return EMPTY_SET;
    const matches = new Set<string>();
    for (const node of graphNodes) {
      if (graphNodeMatchesLocalSearch(node, q)) {
        matches.add(node.id);
      }
    }
    return matches;
  })();

  const hasActiveSearch = params.search.trim().length > 0;

  return {
    apiNodes,
    truncated,
    isLoading,
    isError,
    error,
    directories,
    graphNodes,
    graphEdges,
    searchMatchSet,
    hasActiveSearch,
    activeKinds,
    processId: params.processId,
    blastDirection: params.blastDirection,
    selectedSymbolId: params.blastRadiusOf,
    activeDirectories,
    search: params.search,
    isDark,
    onSearchChange: (q: string) => {
      void setParams({ search: q.length === 0 ? "" : q });
    },
    onToggleKind: (kind: CodeNodeKind) => {
      const current = params.kinds;
      const next = current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind];
      void setParams({ kinds: next });
    },
    onSetProcess: (id: string | null) => {
      void setParams({ processId: id });
    },
    onSelectSymbol: (id: string | null) => {
      // unset any existing process filter when picking a symbol
      void setParams({
        blastRadiusOf: id,
        processId: id ? null : params.processId,
      });
    },
    onToggleBlastDirection: () => {
      void setParams({
        blastDirection:
          params.blastDirection === "upstream" ? "downstream" : "upstream",
      });
    },
    onToggleDirectory: (dir: string) => {
      setActiveDirectories((prev) => {
        const next = new Set(prev);
        next.delete(NONE_SENTINEL);
        if (next.has(dir)) next.delete(dir);
        else next.add(dir);
        return next;
      });
    },
    onSelectAllDirs: () => {
      setActiveDirectories(new Set());
    },
    onClearAllDirs: () => {
      setActiveDirectories(new Set([NONE_SENTINEL]));
    },
    onClearFilters: () => {
      // one write to avoid the per-field race where successive setParams calls
      // throttle to a single URL update reflecting only the last field
      void setParams({
        kinds: DEFAULT_KINDS,
        processId: null,
        blastRadiusOf: null,
        blastDirection: "upstream",
      });
    },
  };
}

export type CodebaseGraphController = ReturnType<
  typeof useCodebaseGraphController
>;
