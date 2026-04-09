"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Button,
  Input,
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
  IconFilter,
  IconX,
} from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import MemoryDetailPanel from "./MemoryDetailPanel";
import TagSidebar from "./_components/TagSidebar";
import {
  searchMemories,
  timeAgo,
  type Memory,
  type SearchResult,
} from "@/lib/memories";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  const handleSelectTag = useCallback((tag: string | null) => {
    setSelectedTag(tag);
    setMobileSidebarOpen(false);
  }, []);

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
    <div className="relative flex h-full min-h-0 gap-4">
      <div className="hidden md:block w-56 flex-shrink-0 overflow-y-auto pr-6">
        <TagSidebar
          memories={allMemories}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
        />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -240, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -240, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden absolute inset-y-0 left-0 z-50 w-60 overflow-y-auto border-r border-border bg-background p-3 rounded-r-xl shadow-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Filter
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="text-muted-foreground"
                >
                  <IconX size={16} />
                </Button>
              </div>
              <TagSidebar
                memories={allMemories}
                selectedTag={selectedTag}
                onSelectTag={handleSelectTag}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        {!isExternalSearch && (
          <div className="flex gap-2 flex-shrink-0 pb-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMobileSidebarOpen(true)}
              className={cn(
                "md:hidden h-12 w-12 flex-shrink-0",
                selectedTag && "border-primary text-primary",
              )}
            >
              <IconFilter size={18} stroke={1.5} />
            </Button>
            <div className="relative flex-1">
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
                "flex-1 min-w-0 min-h-0 overflow-y-auto",
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
                              selectedMemoryId === item.id && "bg-accent",
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
                              <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums flex-shrink-0">
                                {timeAgo(item.createdAt)}
                              </span>
                            </div>
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
