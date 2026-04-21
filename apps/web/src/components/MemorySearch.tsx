import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryStates } from "nuqs";
import { useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { cn } from "@vmem/ui";
import { IconMoodEmpty, IconLoader2 } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import { api } from "@vmem/backend";
import MemoryDetailPanel from "./MemoryDetailPanel";
import ListItemRow from "./_components/ListItemRow";
import AnimatedSearchIcon from "./_components/AnimatedSearchIcon";
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
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";

/**
 * The "list" view of /memories. Mirrors the graph view's node set by merging
 * memories (from Neo4j via Convex), wiki documents/folders, and skills into a
 * single scrollable list. Filters are kind-aware: the Kind filter cuts across
 * all four kinds; Tag/Source/Type filters are memory-scoped and let non-memory
 * items pass through, so e.g. setting a tag filter narrows memories without
 * hiding every wiki doc and skill. Search + filter controls live in the page
 * header (see MemoryListHeaderControls); this component only renders the list.
 */
export default function MemorySearch() {
  const searchParams = useSearch({ strict: false });
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  const { memories: allMemories, isLoading: isMemoriesLoading } =
    useMemoryContext();
  const wikiRows = useQuery(api.wiki.listTree);
  const skillRows = useQuery(api.skills.listMy);
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const searchQuery = params.q;

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

  // Merge memories + wiki + skills into one list-item stream. We defer
  // non-memory queries gracefully — an unresolved Convex useQuery returns
  // `undefined`, which we fall back to an empty array so the list still shows
  // memories immediately while wiki/skills finish loading.
  const allItems = useMemo<ListItem[]>(() => {
    const memoryItems = allMemories.map(memoryToListItem);
    const wikiItems = wikiRows ? wikiRowsToListItems(wikiRows) : [];
    const skillItems = skillRows ? skillRowsToListItems(skillRows) : [];
    return [...memoryItems, ...wikiItems, ...skillItems];
  }, [allMemories, wikiRows, skillRows]);

  // Kind filter runs first — it's the broadest cut.
  const itemsAfterKinds = useMemo(
    () =>
      allItems.filter((item) => listItemMatchesKindFilter(item, params.kinds)),
    [allItems, params.kinds],
  );

  const itemsAfterKindsAndTags = useMemo(
    () =>
      itemsAfterKinds.filter((item) =>
        listItemMatchesTagFilter(item, params.tags),
      ),
    [itemsAfterKinds, params.tags],
  );

  const itemsAfterKindsTagsSources = useMemo(() => {
    if (params.sources.length === 0) {
      return itemsAfterKindsAndTags;
    }
    return itemsAfterKindsAndTags.filter((item) =>
      listItemMatchesSourceFilter(item, params.sources),
    );
  }, [itemsAfterKindsAndTags, params.sources]);

  const itemsAfterTypes = useMemo(() => {
    if (params.types.length === 0) {
      return itemsAfterKindsTagsSources;
    }
    return itemsAfterKindsTagsSources.filter((item) =>
      listItemMatchesTypeFilter(item, params.types),
    );
  }, [itemsAfterKindsTagsSources, params.types]);

  const filteredItems = useMemo(() => {
    return itemsAfterTypes.filter((item) =>
      listItemMatchesProfileFilter(item, params.profile),
    );
  }, [itemsAfterTypes, params.profile]);

  const normalizedQuery = searchQuery.trim();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }
    return searchListItems(filteredItems, normalizedQuery);
  }, [filteredItems, normalizedQuery]);

  const displayItems: Array<{ item: ListItem; score: number | null }> =
    useMemo(() => {
      if (searchResults !== null) {
        return searchResults.map((r: ListItemSearchResult) => ({
          item: r.item,
          score: r.relevanceScore,
        }));
      }
      return filteredItems.map((item) => ({ item, score: null }));
    }, [searchResults, filteredItems]);

  const isShowingSearchResults = searchResults !== null;

  const selectedMemory = useMemo(() => {
    if (!selectedMemoryId) {
      return null;
    }
    return allMemories.find((memory) => memory.id === selectedMemoryId) ?? null;
  }, [allMemories, selectedMemoryId]);

  useEffect(() => {
    if (!selectedMemoryId) {
      return;
    }
    if (!allMemories.some((memory) => memory.id === selectedMemoryId)) {
      setSelectedMemoryId(null);
    }
  }, [allMemories, selectedMemoryId]);

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

  if (isMemoriesLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allItems.length === 0) {
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
