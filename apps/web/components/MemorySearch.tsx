"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryStates } from "nuqs";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input, cn } from "@vmem/ui";
import { IconSearch, IconMoodEmpty, IconLoader2 } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import MemoryDetailPanel from "./MemoryDetailPanel";
import MemoryTagFilter from "./_components/MemoryTagFilter";
import MemorySourceFilter from "./_components/MemorySourceFilter";
import MemoryListItem from "./_components/MemoryListItem";
import {
  searchMemories,
  memoryMatchesTagFilters,
  formatMemorySourceLabel,
  type Memory,
  type SearchResult,
} from "@/lib/memories";
import { memoriesSearchParams } from "@/app/(main)/memories/searchParams";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useTrailData } from "@/hooks/useTrailData";

interface MemorySearchProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function MemorySearch({
  searchQuery: externalQuery,
  onSearchChange,
}: MemorySearchProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  const { memories: allMemories, isLoading } = useMemoryContext();
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = externalQuery ?? internalQuery;
  const setSearchQuery = onSearchChange ?? setInternalQuery;
  const isExternalSearch = externalQuery !== undefined;

  const trailTag = params.tags.length === 1 ? params.tags[0] : null;
  const { trailMap } = useTrailData({ tag: trailTag });

  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  useEffect(() => {
    const legacy = searchParams.get("tag");
    if (!legacy?.trim()) {
      return;
    }
    if (params.tags.length > 0) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("tag");
    next.set("tags", legacy.trim().toLowerCase());
    router.replace(`${pathname}?${next.toString()}`);
  }, [searchParams, pathname, router, params.tags.length]);

  const distinctSources = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMemories) {
      set.add(m.source);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allMemories]);

  const filteredMemories = useMemo(() => {
    let list = allMemories.filter((m) =>
      memoryMatchesTagFilters(m, params.tags),
    );
    if (params.source !== null) {
      list = list.filter((m) => m.source === params.source);
    }
    return list;
  }, [allMemories, params.tags, params.source]);

  const normalizedQuery = searchQuery.trim();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }

    return searchMemories(filteredMemories, normalizedQuery);
  }, [filteredMemories, normalizedQuery]);

  const displayData: (Memory | SearchResult)[] =
    searchResults ?? filteredMemories;
  const isShowingSearchResults = searchResults !== null;

  const searchPlaceholder = useMemo(() => {
    const hints: string[] = [];
    if (params.tags.length > 0) {
      hints.push(params.tags.join(" · "));
    }
    if (params.source !== null) {
      hints.push(formatMemorySourceLabel(params.source));
    }
    if (hints.length === 0) {
      return "Search memories semantically...";
    }
    return `Search (${hints.join(" — ")})...`;
  }, [params.tags, params.source]);

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

  const handleCardClick = useCallback(
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

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allMemories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No memories yet
        </h3>
        <p className="text-sm text-muted-foreground">
          Start by adding your first memory
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        {!isExternalSearch && (
          <div className="flex gap-2 flex-shrink-0 pb-4 flex-wrap">
            <MemoryTagFilter
              memories={allMemories}
              selectedTags={params.tags}
              onTagsChange={(tags) => setParams({ tags })}
            />
            <MemorySourceFilter
              sources={distinctSources}
              selectedSource={params.source}
              onSourceChange={(source) => setParams({ source })}
            />
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <IconSearch
                  className="text-muted-foreground"
                  size={20}
                  stroke={1.5}
                />
              </div>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-12 bg-muted/50 border-border pl-10 text-foreground hover:bg-accent focus-visible:border-ring"
              />
            </div>
          </div>
        )}

        {isShowingSearchResults && displayData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-border rounded-xl">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <IconSearch className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              No results found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try searching with different keywords
            </p>
          </div>
        )}

        {(!isShowingSearchResults || displayData.length > 0) && (
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
                data={displayData}
                computeItemKey={(_index, item) => item.id}
                defaultItemHeight={56}
                itemContent={(_index, item) => (
                  <div className="pb-1.5">
                    <MemoryListItem
                      item={item}
                      isSelected={selectedMemoryId === item.id}
                      isShowingSearchResults={isShowingSearchResults}
                      trailEntry={trailMap.get(item.id)}
                      onCardClick={handleCardClick}
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
