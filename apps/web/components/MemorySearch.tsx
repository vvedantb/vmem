"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Button,
  Input,
  Badge,
  Card,
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@vmem/ui";
import {
  IconSearch,
  IconMoodEmpty,
  IconLoader2,
  IconEdit,
  IconTrash,
} from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import MemoryDetailPanel from "./MemoryDetailPanel";
import TagSidebar from "./_components/TagSidebar";
import { searchMemories, type Memory, type SearchResult } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

interface MemorySearchProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function MemorySearch({
  searchQuery: externalQuery,
  onSearchChange,
}: MemorySearchProps = {}) {
  const searchParams = useSearchParams();
  const { memories: allMemories, isLoading } = useMemoryContext();
  const [internalQuery, setInternalQuery] = useState("");
  const searchQuery = externalQuery ?? internalQuery;
  const setSearchQuery = onSearchChange ?? setInternalQuery;
  const isExternalSearch = externalQuery !== undefined;
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  useEffect(() => {
    const initialTag = searchParams.get("tag");
    if (initialTag && selectedTag === null) {
      setSelectedTag(initialTag.trim().toLowerCase());
    }
  }, [searchParams, selectedTag]);

  const filteredMemories = useMemo(() => {
    if (selectedTag === null) {
      return allMemories;
    }

    return allMemories.filter((memory) => memory.tags.includes(selectedTag));
  }, [allMemories, selectedTag]);

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
    <div className="flex h-full min-h-0 gap-4">
      <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-border pr-3">
        <TagSidebar
          memories={allMemories}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
        />
      </div>

      <div className="flex flex-1 min-w-0 flex-col gap-4">
        {!isExternalSearch && (
          <div className="relative flex-shrink-0">
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
              placeholder={
                selectedTag
                  ? `Search in "${selectedTag}"...`
                  : "Search memories semantically..."
              }
              className="h-12 bg-muted/50 border-border pl-10 text-foreground hover:bg-accent focus-visible:border-ring"
            />
          </div>
        )}

        {selectedTag && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-muted-foreground">Showing:</span>
            <Badge className="bg-primary text-primary-foreground border border-transparent">
              {selectedTag}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ({displayData.length}{" "}
              {displayData.length === 1 ? "memory" : "memories"})
            </span>
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
                "flex-1 min-w-0 overflow-y-auto",
                selectedMemory ? "hidden sm:block" : "",
              )}
            >
              <div className="flex flex-col gap-1.5">
                <AnimatePresence mode="popLayout">
                  {displayData.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                    >
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <Card
                            className={cn(
                              "cursor-pointer transition-all hover:bg-accent/50 px-3 py-2.5",
                              selectedMemoryId === item.id &&
                                "ring-2 ring-primary bg-accent/50",
                            )}
                            onClick={() => handleCardClick(item)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {item.title}
                              </span>
                              {isShowingSearchResults &&
                                "relevanceScore" in item && (
                                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                                    {Math.round(item.relevanceScore * 100)}%
                                  </span>
                                )}
                            </div>
                            {item.tags.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap mt-1.5">
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
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => handleContextEdit(item)}
                          >
                            <IconEdit size={16} stroke={1.5} />
                            Edit
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleContextDelete(item)}
                          >
                            <IconTrash size={16} stroke={1.5} />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
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
                  className="w-full lg:w-[420px] lg:flex-shrink-0"
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
