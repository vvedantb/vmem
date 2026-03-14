"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button, Input, Badge, Card, Skeleton, cn } from "@vmem/ui";
import { IconSearch, IconMoodEmpty, IconX } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import MemoryDetailPanel from "./MemoryDetailPanel";
import {
  buildTagStats,
  searchMemories,
  type Memory,
  type SearchResult,
} from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

export default function MemorySearch() {
  const searchParams = useSearchParams();
  const { memories: allMemories, isLoading } = useMemoryContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);

  useEffect(() => {
    const initialTags = searchParams
      .getAll("tag")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);

    if (initialTags.length === 0) {
      return;
    }

    setSelectedTags((current) =>
      current.length > 0 ? current : Array.from(new Set(initialTags)),
    );
  }, [searchParams]);

  const allTags = useMemo(() => buildTagStats(allMemories), [allMemories]);

  const filteredMemories = useMemo(() => {
    if (selectedTags.length === 0) {
      return allMemories;
    }

    return allMemories.filter((memory) =>
      selectedTags.every((tag) => memory.tags.includes(tag)),
    );
  }, [allMemories, selectedTags]);

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

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const clearTagFilters = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const relatedMemories = useMemo(() => {
    if (!selectedMemory) return [];
    return allMemories.filter(
      (memory) =>
        memory.id !== selectedMemory.id &&
        memory.tags.some((tag) => selectedMemory.tags.includes(tag)),
    );
  }, [selectedMemory, allMemories]);

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
      setSelectedMemoryId(selectedMemoryId === memory.id ? null : memory.id);
    },
    [selectedMemoryId],
  );

  if (isLoading) {
    return (
      <>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </>
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
    <>
      <div className="relative">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories semantically..."
          className="h-12 bg-muted/50 border-border pr-10 text-foreground hover:bg-accent focus-visible:border-ring"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <IconSearch
            className="text-muted-foreground"
            size={20}
            stroke={1.5}
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by tags:</span>
          {allTags.map((item) => (
            <Badge
              key={item.tag}
              className={`cursor-pointer transition-all ${
                selectedTags.includes(item.tag)
                  ? "bg-primary text-primary-foreground border border-transparent"
                  : "bg-muted text-muted-foreground border border-border hover:bg-accent"
              }`}
              onClick={() => toggleTag(item.tag)}
            >
              {item.tag}
              <span
                className={`ml-1 ${
                  selectedTags.includes(item.tag)
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                }`}
              >
                ({item.count})
              </span>
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearTagFilters}
              className="h-auto px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconX size={14} />
              Clear
            </Button>
          )}
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
            "flex gap-4",
            selectedMemory ? "flex-col lg:flex-row" : "",
          )}
        >
          <div
            className={cn(
              "flex-1 min-w-0",
              selectedMemory
                ? "lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-1"
                : "",
            )}
          >
            <div
              className={cn(
                "grid gap-3",
                selectedMemory
                  ? "grid-cols-1"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              <AnimatePresence mode="popLayout">
                {displayData.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className={cn(
                        "cursor-pointer transition-all hover:bg-accent/50 p-4",
                        selectedMemoryId === item.id &&
                          "ring-2 ring-primary bg-accent/50",
                      )}
                      onClick={() => handleCardClick(item)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </span>
                        {isShowingSearchResults && "relevanceScore" in item && (
                          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                            {Math.round(item.relevanceScore * 100)}%
                          </span>
                        )}
                      </div>
                      {item.tags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {item.tags.map((tag) => (
                            <Badge
                              key={tag}
                              className="bg-muted text-muted-foreground border border-border text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {selectedMemory && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="lg:w-[420px] lg:flex-shrink-0"
              >
                <MemoryDetailPanel
                  memory={selectedMemory}
                  onClose={() => setSelectedMemoryId(null)}
                  onMemoryUpdate={handleMemoryUpdate}
                  onMemoryDelete={handleMemoryDelete}
                  relatedMemories={relatedMemories}
                  onSelectRelated={(memory) => setSelectedMemoryId(memory.id)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
