"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Skeleton,
  Spinner,
} from "@heroui/react";
import { IconSearch, IconAlertCircle, IconMoodEmpty } from "@tabler/icons-react";
import MemoryDetailModal from "./MemoryDetailModal";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface SearchResult extends Memory {
  relevanceScore: number;
}

interface ApiResponse {
  success: boolean;
  data: Memory[];
  count: number;
  error?: string;
}

interface SearchResponse {
  success: boolean;
  data: SearchResult[];
  count: number;
  query: string;
  error?: string;
}

export default function MemorySearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  // Fetch all memories on mount
  useEffect(() => {
    const fetchMemories = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/memories");
        const data: ApiResponse = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch memories");
        }

        setMemories(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch memories");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMemories();
  }, []);

  // Semantic search with debounce
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const response = await fetch("/api/memories/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data: SearchResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setSearchResults(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search input with debounce
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);

    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // If empty, clear results immediately
    if (!value.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    // Set searching state immediately for UI feedback
    setIsSearching(true);

    // Debounce the actual search
    debounceTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Determine which data to display
  const displayData: (Memory | SearchResult)[] = searchResults ?? memories;
  const isShowingSearchResults = searchResults !== null;

  // Calculate related memories for the selected memory
  const relatedMemories = useMemo(() => {
    if (!selectedMemory) return [];
    return memories.filter(
      (m) =>
        m.id !== selectedMemory.id &&
        m.tags.some((tag) => selectedMemory.tags.includes(tag))
    );
  }, [selectedMemory, memories]);

  // Handle memory update from modal
  const handleMemoryUpdate = useCallback((updatedMemory: Memory) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === updatedMemory.id ? updatedMemory : m))
    );
    setSelectedMemory(updatedMemory);
    // Also update search results if they exist
    setSearchResults((prev) =>
      prev
        ? prev.map((m) =>
            m.id === updatedMemory.id
              ? { ...updatedMemory, relevanceScore: m.relevanceScore }
              : m
          )
        : null
    );
  }, []);

  // Handle memory delete from modal
  const handleMemoryDelete = useCallback((deletedId: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== deletedId));
    setSearchResults((prev) =>
      prev ? prev.filter((m) => m.id !== deletedId) : null
    );
  }, []);

  // Handle clicking on a row to open detail modal
  const handleRowClick = useCallback((memory: Memory) => {
    setSelectedMemory(memory);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-4">
            <div className="flex gap-8">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-16 rounded hidden md:block" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center gap-8">
                <Skeleton className="h-4 w-48 rounded" />
                <div className="hidden md:flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <IconAlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          Failed to load memories
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty state (no memories at all)
  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
          <IconMoodEmpty className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          No memories yet
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Start by adding your first memory
        </p>
      </div>
    );
  }

  return (
    <>
      <Input
        type="text"
        value={searchQuery}
        onValueChange={handleSearchChange}
        placeholder="Search memories semantically..."
        size="lg"
        endContent={
          isSearching ? (
            <Spinner size="sm" color="default" />
          ) : (
            <IconSearch
              className="text-neutral-400 dark:text-neutral-600"
              size={20}
              stroke={1.5}
            />
          )
        }
        classNames={{
          inputWrapper:
            "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
          input: "text-black dark:text-white",
        }}
      />

      {/* Empty search results state */}
      {isShowingSearchResults && displayData.length === 0 && !isSearching && (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-black/10 dark:border-white/10 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
            <IconSearch className="w-5 h-5 text-neutral-400 dark:text-neutral-500" />
          </div>
          <h3 className="text-base font-medium text-neutral-800 dark:text-neutral-200 mb-1">
            No results found
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Try searching with different keywords
          </p>
        </div>
      )}

      {/* Results table */}
      {(!isShowingSearchResults || displayData.length > 0) && (
        <Table
          aria-label="Memories table"
          classNames={{
            wrapper:
              "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
            th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
            td: "py-5",
            tr: "hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer",
          }}
        >
          <TableHeader>
            <TableColumn>TITLE</TableColumn>
            <TableColumn className={isShowingSearchResults ? "w-24" : "hidden"}>SCORE</TableColumn>
            <TableColumn className="hidden md:table-cell">TAGS</TableColumn>
            <TableColumn>CREATED</TableColumn>
          </TableHeader>
          <TableBody emptyContent="No memories yet">
            {displayData.map((item) => (
              <TableRow key={item.id} onClick={() => handleRowClick(item)}>
                <TableCell>
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {item.title}
                  </span>
                </TableCell>
                <TableCell className={isShowingSearchResults ? "" : "hidden"}>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-black dark:bg-white rounded-full"
                        style={{
                          width: `${Math.round(("relevanceScore" in item ? item.relevanceScore : 0) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {Math.round(("relevanceScore" in item ? item.relevanceScore : 0) * 100)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex gap-2 flex-wrap">
                    {item.tags.map((tag) => (
                      <Chip
                        key={tag}
                        size="sm"
                        variant="flat"
                        classNames={{
                          base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                          content:
                            "text-neutral-600 dark:text-neutral-400 text-xs",
                        }}
                      >
                        {tag}
                      </Chip>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-neutral-500">
                    {formatDate(item.createdAt)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Memory detail modal */}
      <MemoryDetailModal
        isOpen={!!selectedMemory}
        memory={selectedMemory}
        onClose={() => setSelectedMemory(null)}
        onMemoryUpdate={handleMemoryUpdate}
        onMemoryDelete={handleMemoryDelete}
        relatedMemories={relatedMemories}
        onSelectRelated={setSelectedMemory}
      />
    </>
  );
}
