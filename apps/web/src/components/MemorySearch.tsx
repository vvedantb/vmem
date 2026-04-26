import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryStates } from "nuqs";
import { useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { cn } from "@vmem/ui";
import { IconMoodEmpty } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import { api } from "@vmem/backend";
import MemoryDetailPanel from "./MemoryDetailPanel";
import ListItemRow from "./_components/ListItemRow";
import AnimatedSearchIcon from "./_components/AnimatedSearchIcon";
import { VmemSpinner } from "@/components/svg-animations";
import { type Memory } from "@/lib/memories";
import {
  listItemMatchesKindFilter,
  listItemMatchesProfileFilter,
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
import { memoriesSearchParams } from "@/routes/_main/memories/-searchParams";
import { useMemoryListFlat } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";

/**
 * The "list" view of /memories. Mirrors the graph view's node set by merging
 * memories (from Neo4j via Convex), wiki documents/folders, and skills into a
 * single scrollable list. Memory filters (profile, type, source, tags, search)
 * are pushed into Cypher via the paginated `useMemoryListFlat` hook — the list
 * page no longer fetches every memory upfront. Wiki and skills stay fully
 * loaded because they're small (single Convex queries already cached).
 *
 * Kind filter is the only cross-cutting filter; when the user excludes
 * memories via the kind filter the list simply hides them and Virtuoso
 * stops asking for more pages.
 */
export default function MemorySearch() {
  const searchParams = useSearch({ strict: false });
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  const searchQuery = params.q;
  const normalizedQuery = searchQuery.trim();
  const trimmedProfile = params.profile ?? null;

  // First type in the filter wins for the server-side roundtrip. The server
  // only supports a single type; multi-type is rare in practice and the
  // post-merge kind filter handles any residual UI edge cases.
  const primaryType = params.types.length > 0 ? params.types[0] : undefined;
  const primarySource =
    params.sources.length > 0 ? params.sources[0] : undefined;

  const kindIncludesMemory =
    params.kinds.length === 0 || params.kinds.includes("memory");

  const memoryPage = useMemoryListFlat({
    profileId: trimmedProfile,
    type: primaryType,
    source: primarySource,
    tags: params.tags,
    searchQuery: normalizedQuery || undefined,
  });

  const {
    memories: memoryResults,
    isLoading: isMemoriesLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = memoryPage;

  const wikiRows = useQuery(api.wiki.listTree);
  const skillRows = useQuery(api.skills.listMy);
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const trailTag = params.tags.length === 1 ? params.tags[0] : null;
  const { trailMap } = useTrailData({ tag: trailTag });

  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  // Legacy param migration: convert old ?tag= to new ?tags=
  useEffect(() => {
    const legacy =
      typeof searchParams === "object" &&
      searchParams !== null &&
      "tag" in searchParams
        ? (searchParams.tag as string)
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
      "source" in searchParams
        ? (searchParams.source as string)
        : null;
    if (!legacy?.trim()) return;
    if (params.sources.length > 0) return;
    void setParams({ sources: [legacy.trim()] });
  }, [searchParams, params.sources.length, setParams]);

  // Memory items come back already filtered + scored from the server. They
  // only get the final kind filter applied here (the user may have excluded
  // "memory" from the kind set; we still display in that case but the list
  // section is hidden below).
  const memoryItems = useMemo<ListItem[]>(
    () => memoryResults.map(memoryToListItem),
    [memoryResults],
  );

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
        listItemMatchesTypeFilter(item, params.types) &&
        listItemMatchesProfileFilter(item, params.profile),
    );
  }, [
    wikiItemsRaw,
    skillItemsRaw,
    params.kinds,
    params.tags,
    params.sources,
    params.types,
    params.profile,
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

  // Client-side search only scores wiki/skills; memories already come back
  // scored from Cypher's fulltext index, so they keep their server order.
  const isShowingSearchResults = normalizedQuery.length > 0;
  const nonMemorySearchResults = useMemo<ListItemSearchResult[] | null>(() => {
    if (!isShowingSearchResults) return null;
    return searchListItems(filteredNonMemoryItems, normalizedQuery);
  }, [filteredNonMemoryItems, normalizedQuery, isShowingSearchResults]);

  // Memories already arrive in score order from the server when searching
  // and in createdAt-DESC order otherwise. Either way we render them first,
  // followed by non-memory items.
  const displayItems: Array<{ item: ListItem; score: number | null }> =
    useMemo(() => {
      const memoryEntries = memoryItemsAfterKind.map((item) => ({
        item,
        score: isShowingSearchResults ? 1 : null,
      }));
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
      isShowingSearchResults,
    ]);

  const totalItems =
    memoryItemsAfterKind.length + filteredNonMemoryItems.length;

  const selectedMemory = useMemo<Memory | null>(() => {
    if (!selectedMemoryId) {
      return null;
    }
    return (
      memoryResults.find((memory) => memory.id === selectedMemoryId) ?? null
    );
  }, [memoryResults, selectedMemoryId]);

  useEffect(() => {
    if (!selectedMemoryId) return;
    // Only clear the selection if we've actually finished loading pages and
    // the memory is still missing — otherwise typing in the search box would
    // flicker the detail panel off for the one keystroke before the next
    // page arrives.
    if (isMemoriesLoading || isFetchingNextPage || hasNextPage) return;
    if (!memoryResults.some((memory) => memory.id === selectedMemoryId)) {
      setSelectedMemoryId(null);
    }
  }, [
    memoryResults,
    selectedMemoryId,
    isMemoriesLoading,
    isFetchingNextPage,
    hasNextPage,
  ]);

  const handleMemoryUpdate = useCallback((updatedMemory: Memory) => {
    setSelectedMemoryId(updatedMemory.id);
  }, []);

  const handleMemoryDelete = useCallback(
    (deletedId: string) => {
      if (selectedMemoryId === deletedId) {
        setSelectedMemoryId(null);
      }
    },
    [selectedMemoryId],
  );

  const handleMemoryClick = useCallback(
    (memory: Memory) => {
      setPanelAction(null);
      setSelectedMemoryId(selectedMemoryId === memory.id ? null : memory.id);
    },
    [selectedMemoryId],
  );

  const handleContextEdit = useCallback((memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("edit");
  }, []);

  const handleContextDelete = useCallback((memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("delete");
  }, []);

  const handleConsumeAction = useCallback(() => {
    setPanelAction(null);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isMemoriesLoading) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isMemoriesLoading, fetchNextPage]);

  // Initial load: block render until we've heard back from the memory
  // page query at least once. Subsequent page fetches render inline.
  if (isMemoriesLoading && memoryResults.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  if (totalItems === 0 && !isShowingSearchResults) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Nothing here yet
        </h3>
        <p className="text-sm text-muted-foreground">
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
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <AnimatedSearchIcon className="text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              No results found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try searching with different keywords
            </p>
          </div>
        )}

        {(!isShowingSearchResults || displayItems.length > 0) && (
          <div
            className={cn(
              "flex flex-1 min-h-0 gap-4",
              selectedMemory ? "flex-col lg:flex-row" : "",
            )}
          >
            <div
              className={cn(
                "flex-1 min-w-0 min-h-0",
                selectedMemory ? "hidden sm:block" : "",
              )}
            >
              <Virtuoso
                data={displayItems}
                computeItemKey={(_index, entry) => entry.item.id}
                defaultItemHeight={44}
                endReached={handleEndReached}
                itemContent={(_index, entry) => (
                  <div className="pb-1.5">
                    <ListItemRow
                      item={entry.item}
                      relevanceScore={entry.score}
                      isSelected={selectedMemoryId === entry.item.id}
                      trailEntry={trailMap.get(entry.item.id)}
                      isDark={isDark}
                      onMemoryClick={handleMemoryClick}
                      onContextEdit={handleContextEdit}
                      onContextDelete={handleContextDelete}
                    />
                  </div>
                )}
                style={{ height: "100%" }}
              />
            </div>

            <AnimatePresence>
              {selectedMemory && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="w-full lg:w-[420px] lg:flex-shrink-0 min-h-0 overflow-y-auto"
                >
                  <MemoryDetailPanel
                    memory={selectedMemory}
                    onClose={() => setSelectedMemoryId(null)}
                    onMemoryUpdate={handleMemoryUpdate}
                    onMemoryDelete={handleMemoryDelete}
                    onSelectRelated={(memory) => setSelectedMemoryId(memory.id)}
                    startInEditMode={panelAction === "edit"}
                    startWithDelete={panelAction === "delete"}
                    onConsumeAction={handleConsumeAction}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
