import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { Button, cn } from "@vmem/ui";
import {
  IconAlertCircle,
  IconMoodEmpty,
  IconRefresh,
} from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import { api } from "@vmem/backend";
import MemoryDetailPanel from "./MemoryDetailPanel";
import ListItemRow from "./_components/ListItemRow";
import AnimatedSearchIcon from "./_components/AnimatedSearchIcon";
import { VmemSpinner } from "@/components/svg-animations";
import type { Memory, MemoryType } from "@/lib/memories";
import {
  listItemMatchesKindFilter,
  listItemMatchesSourceFilter,
  listItemMatchesTagFilter,
  listItemMatchesTypeFilter,
  memoryToListItem,
  searchListItems,
  skillRowsToListItems,
  wikiRowsToListItems,
  type ListItem,
  type ListItemSearchResult,
} from "@/lib/list-items";
import { useMemoriesSearchParams } from "@/routes/_main/$profileId/memories/useMemoriesSearchParams";
import { useMemoryListFlat } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";
import type { TrailEntry } from "@/hooks/useTrailData";
import {
  relativeRelevanceScore,
  type MemoryTrace,
} from "./_components/memory-trace";

type MemoryListEntry = {
  item: ListItem;
  score: number | null;
  trace?: MemoryTrace;
};

interface MemoryListVirtuosoContext {
  memoryId: string | null;
  trailMap: Map<string, TrailEntry>;
  isDark: boolean;
  onMemoryClick: (memory: Memory) => void;
  onContextEdit: (memory: Memory) => void;
  onContextDelete: (memory: Memory) => void;
}

function MemoryListVirtuosoRow({
  entry,
  context,
}: {
  entry: MemoryListEntry;
  context?: MemoryListVirtuosoContext;
}) {
  if (!context) return null;
  return (
    <div className="pb-1.5">
      <ListItemRow
        item={entry.item}
        relevanceScore={entry.score}
        trace={entry.trace}
        isSelected={context.memoryId === entry.item.id}
        trailEntry={context.trailMap.get(entry.item.id)}
        isDark={context.isDark}
        onMemoryClick={context.onMemoryClick}
        onContextEdit={context.onContextEdit}
        onContextDelete={context.onContextDelete}
      />
    </div>
  );
}

function renderMemoryListVirtuosoRow(
  _index: number,
  entry: MemoryListEntry,
  context?: MemoryListVirtuosoContext,
) {
  return <MemoryListVirtuosoRow entry={entry} context={context} />;
}

function isMemoryType(value: string): value is MemoryType {
  return value === "profile" || value === "episodic" || value === "knowledge";
}

function apiMemoryToMemory(m: {
  id: string;
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  createdAt: string;
  profileId?: string;
  sourceUrl?: string | null;
  sourceSyncedAt?: string | null;
}): Memory {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    type: isMemoryType(m.type) ? m.type : "knowledge",
    source: m.source,
    sourceUrl: m.sourceUrl ?? null,
    sourceSyncedAt: m.sourceSyncedAt ?? null,
    tags: m.tags,
    createdAt: m.createdAt,
    profileId: m.profileId,
  };
}

interface MemorySearchProps {
  memoryId: string | null;
}

/**
 * The "list" view of /memories. Mirrors the graph view's node set by merging
 * memories (from Neo4j via Convex), wiki documents/folders, and skills into a
 * single scrollable list. Browse mode uses paginated `useMemoryListFlat`.
 * When `q` is set and memories are included in the kind filter, memory hits
 * come from `retrieveMemories` with real Context Trace scores instead of
 * listMemories fulltext ordering.
 *
 * Kind filter is the only cross-cutting filter; when the user excludes
 * memories via the kind filter the list simply hides them and Virtuoso
 * stops asking for more pages.
 */
export default function MemorySearch({ memoryId }: MemorySearchProps) {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const searchParams = useSearch({ strict: false });
  const [params, setParams] = useMemoriesSearchParams();
  const getMemory = useAction(api.memoryApi.getMemory);

  const searchQuery = params.q;
  const normalizedQuery = searchQuery.trim();

  // First type in the filter wins for the server-side roundtrip. The server
  // only supports a single type; multi-type is rare in practice and the
  // post-merge kind filter handles any residual UI edge cases.
  const primaryType = params.types.length > 0 ? params.types[0] : undefined;
  const primarySource =
    params.sources.length > 0 ? params.sources[0] : undefined;

  const kindIncludesMemory =
    params.kinds.length === 0 || params.kinds.includes("memory");

  const isHybridSearch = normalizedQuery.length > 0 && kindIncludesMemory;

  const memoryPage = useMemoryListFlat({
    profileId: activeProfile._id,
    type: primaryType,
    source: primarySource,
    tags: params.tags,
    searchQuery: isHybridSearch ? undefined : normalizedQuery || undefined,
    enabled: !isHybridSearch,
  });

  const retrieveMemoriesAction = useAction(api.memoryApi.retrieveMemories);

  const retrieveQuery = useQuery({
    queryKey: [
      "retrieveMemories",
      activeProfile._id,
      normalizedQuery,
      primaryType,
      params.tags,
    ],
    enabled: isHybridSearch,
    queryFn: async () => {
      return retrieveMemoriesAction({
        query: normalizedQuery,
        profileId: activeProfile._id,
        type: primaryType,
        tags: params.tags.length > 0 ? params.tags : undefined,
        limit: 25,
      });
    },
  });

  const {
    isLoading: isBrowseMemoriesLoading,
    isError: isBrowseMemoriesError,
    refetch: refetchBrowseMemories,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = memoryPage;

  const browseMemoryResults = memoryPage.memories;

  const hybridMemoryResults = useMemo<Memory[]>(() => {
    if (!retrieveQuery.data) return [];
    return retrieveQuery.data.memories.map(apiMemoryToMemory);
  }, [retrieveQuery.data]);

  const memoryResults = isHybridSearch
    ? hybridMemoryResults
    : browseMemoryResults;

  const isMemoriesLoading = isHybridSearch
    ? retrieveQuery.isLoading
    : isBrowseMemoriesLoading;

  const isMemoriesError = isHybridSearch
    ? retrieveQuery.isError
    : isBrowseMemoriesError;

  const refetchMemories = isHybridSearch
    ? retrieveQuery.refetch
    : refetchBrowseMemories;

  const wikiRows = useConvexQuery(api.wiki.listTree, {
    teamId: activeProfile.teamId,
  });
  const skillRows = useConvexQuery(api.skills.listMy, {
    teamId: activeProfile.teamId,
  });
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const trailTag =
    params.tags.length === 1 ? (params.tags.at(0) ?? null) : null;
  const { trailMap } = useTrailData({ tag: trailTag });

  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  // Legacy param migration: convert old ?tag= to new ?tags=
  useEffect(() => {
    const legacy =
      typeof searchParams === "object" &&
      searchParams !== null &&
      "tag" in searchParams &&
      typeof searchParams.tag === "string"
        ? searchParams.tag
        : null;
    if (!legacy?.trim()) return;
    if (params.tags.length > 0) return;
    void setParams({ tags: [legacy.trim().toLowerCase()] });
  }, [searchParams, params.tags.length, setParams]);

  // Legacy param migration: convert old ?source= to new ?sources=
  useEffect(() => {
    const legacy =
      typeof searchParams === "object" &&
      searchParams !== null &&
      "source" in searchParams &&
      typeof searchParams.source === "string"
        ? searchParams.source
        : null;
    if (!legacy?.trim()) return;
    if (params.sources.length > 0) return;
    void setParams({ sources: [legacy.trim()] });
  }, [searchParams, params.sources.length, setParams]);

  // Memory items: browse from paginated list, or hybrid search from retrieve.
  const memoryItems = useMemo<ListItem[]>(
    () => memoryResults.map(memoryToListItem),
    [memoryResults],
  );

  const traceByMemoryId = useMemo(() => {
    const map = new Map<string, MemoryTrace>();
    if (!isHybridSearch || !retrieveQuery.data) return map;
    for (const candidate of retrieveQuery.data.memories) {
      map.set(candidate.id, candidate.trace);
    }
    return map;
  }, [isHybridSearch, retrieveQuery.data]);

  const maxRetrieveScore = useMemo(() => {
    if (!retrieveQuery.data?.memories.length) return 1;
    let max = 0;
    for (const candidate of retrieveQuery.data.memories) {
      if (candidate.trace.score > max) max = candidate.trace.score;
    }
    return max > 0 ? max : 1;
  }, [retrieveQuery.data]);

  // Wiki + skill items come fully loaded. They run through the regular
  // client filter chain: kind (restrictive) + tag/source/type/profile
  // (pass-through for non-memory kinds per the helpers' semantics).
  const wikiItemsRaw = useMemo<ListItem[]>(
    () => (wikiRows ? wikiRowsToListItems(wikiRows) : []),
    [wikiRows],
  );
  const skillItemsRaw = useMemo<ListItem[]>(
    () => (skillRows ? skillRowsToListItems(skillRows) : []),
    [skillRows],
  );

  const filteredNonMemoryItems = useMemo<ListItem[]>(() => {
    const nonMemory = [...wikiItemsRaw, ...skillItemsRaw];
    return nonMemory.filter(
      (item) =>
        listItemMatchesKindFilter(item, params.kinds) &&
        listItemMatchesTagFilter(item, params.tags) &&
        listItemMatchesSourceFilter(item, params.sources) &&
        listItemMatchesTypeFilter(item, params.types),
    );
  }, [
    wikiItemsRaw,
    skillItemsRaw,
    params.kinds,
    params.tags,
    params.sources,
    params.types,
  ]);

  // If multiple types were selected, the server returned results for only
  // the first. Filter the remainder locally so the displayed set still
  // respects the full URL state. Same story for multi-source.
  const memoryItemsAfterMultiFilter = useMemo<ListItem[]>(() => {
    if (params.types.length <= 1 && params.sources.length <= 1) {
      return memoryItems;
    }
    return memoryItems.filter((item) => {
      if (params.types.length > 1 && item.kind === "memory") {
        if (!params.types.includes(item.type)) return false;
      }
      if (params.sources.length > 1 && item.kind === "memory") {
        if (!params.sources.includes(item.source)) return false;
      }
      return true;
    });
  }, [memoryItems, params.types, params.sources]);

  const memoryItemsAfterKind = useMemo<ListItem[]>(
    () =>
      kindIncludesMemory
        ? memoryItemsAfterMultiFilter.filter((item) =>
            listItemMatchesKindFilter(item, params.kinds),
          )
        : [],
    [memoryItemsAfterMultiFilter, params.kinds, kindIncludesMemory],
  );

  // Client-side search scores wiki/skills; memory hits use retrieveMemories.
  const isShowingSearchResults = normalizedQuery.length > 0;
  const nonMemorySearchResults = useMemo<ListItemSearchResult[] | null>(() => {
    if (!isShowingSearchResults) return null;
    return searchListItems(filteredNonMemoryItems, normalizedQuery);
  }, [filteredNonMemoryItems, normalizedQuery, isShowingSearchResults]);

  const displayItems: MemoryListEntry[] = useMemo(() => {
    const memoryEntries = memoryItemsAfterKind.map((item) => {
      const trace = traceByMemoryId.get(item.id);
      if (trace) {
        return {
          item,
          score: relativeRelevanceScore(trace.score, maxRetrieveScore),
          trace,
        };
      }
      return { item, score: null };
    });
    if (nonMemorySearchResults !== null) {
      const nonMemoryEntries = nonMemorySearchResults.map((r) => ({
        item: r.item,
        score: r.relevanceScore,
      }));
      return [...memoryEntries, ...nonMemoryEntries];
    }
    const nonMemoryEntries = filteredNonMemoryItems.map((item) => ({
      item,
      score: null,
    }));
    return [...memoryEntries, ...nonMemoryEntries];
  }, [
    memoryItemsAfterKind,
    filteredNonMemoryItems,
    nonMemorySearchResults,
    traceByMemoryId,
    maxRetrieveScore,
  ]);

  const totalItems =
    memoryItemsAfterKind.length + filteredNonMemoryItems.length;

  const memoryFromList = useMemo<Memory | null>(() => {
    if (!memoryId) return null;
    return memoryResults.find((memory) => memory.id === memoryId) ?? null;
  }, [memoryResults, memoryId]);

  const { data: fetchedMemory, isLoading: isFetchingMemory } = useQuery({
    queryKey: ["memory", memoryId],
    enabled: memoryId !== null && memoryFromList === null,
    queryFn: async () => {
      if (memoryId === null) return null;
      return getMemory({ memoryId, profileId: activeProfile._id });
    },
  });

  const selectedMemory = useMemo<Memory | null>(() => {
    if (!memoryId) return null;
    if (memoryFromList) return memoryFromList;
    if (fetchedMemory) return apiMemoryToMemory(fetchedMemory);
    return null;
  }, [memoryId, memoryFromList, fetchedMemory]);

  useEffect(() => {
    if (!memoryId) return;
    if (isHybridSearch) {
      if (retrieveQuery.isLoading) return;
    } else if (isBrowseMemoriesLoading || isFetchingNextPage || hasNextPage) {
      return;
    }
    if (isFetchingMemory) return;
    const inList = memoryResults.some((memory) => memory.id === memoryId);
    const hasMemory = inList || fetchedMemory !== null;
    if (!hasMemory) {
      void navigate({
        to: "/$profileId/memories/list",
        params: { profileId: activeProfile._id },
      });
    }
  }, [
    activeProfile._id,
    memoryId,
    memoryResults,
    fetchedMemory,
    isHybridSearch,
    retrieveQuery.isLoading,
    isBrowseMemoriesLoading,
    isFetchingNextPage,
    hasNextPage,
    isFetchingMemory,
    navigate,
  ]);

  const openMemory = useCallback(
    (id: string) => {
      void navigate({
        to: "/$profileId/memories/list/$id",
        params: { profileId: activeProfile._id, id },
      });
    },
    [navigate, activeProfile._id],
  );

  const closeMemory = useCallback(() => {
    void navigate({
      to: "/$profileId/memories/list",
      params: { profileId: activeProfile._id },
    });
  }, [navigate, activeProfile._id]);

  const handleMemoryUpdate = useCallback(
    (updatedMemory: Memory) => {
      if (memoryId !== updatedMemory.id) {
        openMemory(updatedMemory.id);
      }
    },
    [memoryId, openMemory],
  );

  const handleMemoryDelete = useCallback(
    (deletedId: string) => {
      if (memoryId === deletedId) {
        closeMemory();
      }
    },
    [memoryId, closeMemory],
  );

  const handleMemoryClick = useCallback(
    (memory: Memory) => {
      setPanelAction(null);
      if (memoryId === memory.id) {
        closeMemory();
        return;
      }
      openMemory(memory.id);
    },
    [memoryId, closeMemory, openMemory],
  );

  const handleContextEdit = useCallback(
    (memory: Memory) => {
      openMemory(memory.id);
      setPanelAction("edit");
    },
    [openMemory],
  );

  const handleContextDelete = useCallback(
    (memory: Memory) => {
      openMemory(memory.id);
      setPanelAction("delete");
    },
    [openMemory],
  );

  const handleConsumeAction = useCallback(() => {
    setPanelAction(null);
  }, []);

  const handleEndReached = useCallback(() => {
    if (isHybridSearch) return;
    if (hasNextPage && !isFetchingNextPage && !isBrowseMemoriesLoading) {
      void fetchNextPage();
    }
  }, [
    isHybridSearch,
    hasNextPage,
    isFetchingNextPage,
    isBrowseMemoriesLoading,
    fetchNextPage,
  ]);

  const hasMemoryRoute = memoryId !== null;
  const isPanelLoading =
    hasMemoryRoute &&
    selectedMemory === null &&
    (isFetchingMemory ||
      (isHybridSearch
        ? retrieveQuery.isLoading
        : isBrowseMemoriesLoading || isFetchingNextPage));

  // Initial load: block render until memory data is ready.
  if (isMemoriesLoading && memoryResults.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  // A failed list load must never masquerade as an empty workspace —
  // that exact silence cost a debugging session once.
  if (isMemoriesError && memoryResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
          <IconAlertCircle className="w-6 h-6 text-danger" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2 text-balance">
          Failed to load memories
        </h3>
        <p className="text-sm text-muted mb-4">
          Something went wrong fetching this workspace's memories.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetchMemories()}
        >
          <IconRefresh size={16} />
          Try again
        </Button>
      </div>
    );
  }

  if (totalItems === 0 && !isShowingSearchResults) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2 text-balance">
          Nothing here yet
        </h3>
        <p className="text-sm text-muted">
          Add a memory, wiki doc, or skill to get started
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        {isShowingSearchResults && displayItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center mb-3">
              <AnimatedSearchIcon className="text-muted" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1 text-balance">
              No results found
            </h3>
            <p className="text-sm text-muted">
              Try searching with different keywords
            </p>
          </div>
        )}

        {(!isShowingSearchResults || displayItems.length > 0) && (
          <div
            className={cn(
              "flex flex-1 min-h-0 gap-4",
              hasMemoryRoute ? "flex-col lg:flex-row" : "",
            )}
          >
            <div
              className={cn(
                "min-w-0 min-h-0",
                hasMemoryRoute
                  ? "hidden sm:block lg:min-w-0 lg:flex-1"
                  : "flex-1",
              )}
            >
              <Virtuoso
                data={displayItems}
                className="scrollbar-thin"
                context={{
                  memoryId,
                  trailMap,
                  isDark,
                  onMemoryClick: handleMemoryClick,
                  onContextEdit: handleContextEdit,
                  onContextDelete: handleContextDelete,
                }}
                computeItemKey={(_index, entry) => entry.item.id}
                defaultItemHeight={44}
                endReached={handleEndReached}
                itemContent={renderMemoryListVirtuosoRow}
                style={{ height: "100%" }}
              />
            </div>

            {hasMemoryRoute ? (
              <div className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1">
                {selectedMemory ? (
                  <MemoryDetailPanel
                    key={memoryId}
                    memory={selectedMemory}
                    onClose={closeMemory}
                    onMemoryUpdate={handleMemoryUpdate}
                    onMemoryDelete={handleMemoryDelete}
                    onSelectRelated={(memory) => openMemory(memory.id)}
                    initialAction={panelAction ?? undefined}
                    onConsumeAction={handleConsumeAction}
                  />
                ) : isPanelLoading ? (
                  <div className="flex h-full items-center justify-center rounded-lg bg-surface-secondary">
                    <VmemSpinner size={20} className="text-muted" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
