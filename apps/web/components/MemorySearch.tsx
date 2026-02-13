"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Input,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  Skeleton,
  Spinner,
} from "@vmem/ui";
import {
  IconSearch,
  IconAlertCircle,
  IconMoodEmpty,
  IconX,
} from "@tabler/icons-react";
import MemoryDetailModal from "./MemoryDetailModal";

interface TagStats {
  tag: string;
  count: number;
}

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
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  const [allTags, setAllTags] = useState<TagStats[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [memoriesRes, tagsRes] = await Promise.all([
          fetch("/api/memories"),
          fetch("/api/memories/tags"),
        ]);

        const memoriesData: ApiResponse = await memoriesRes.json();
        const tagsData = await tagsRes.json();

        if (!memoriesRes.ok) {
          throw new Error(memoriesData.error || "Failed to fetch memories");
        }

        setMemories(memoriesData.data);
        if (tagsData.success) {
          setAllTags(tagsData.data);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch memories",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      if (!value.trim()) {
        setSearchResults(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      debounceTimeoutRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    },
    [performSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const clearTagFilters = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const filteredMemories = useMemo(() => {
    if (selectedTags.length === 0) return memories;
    return memories.filter((m) =>
      selectedTags.every((tag) => m.tags.includes(tag)),
    );
  }, [memories, selectedTags]);

  const displayData: (Memory | SearchResult)[] = searchResults
    ? searchResults.filter(
        (m) =>
          selectedTags.length === 0 ||
          selectedTags.every((tag) => m.tags.includes(tag)),
      )
    : filteredMemories;
  const isShowingSearchResults = searchResults !== null;

  const relatedMemories = useMemo(() => {
    if (!selectedMemory) return [];
    return memories.filter(
      (m) =>
        m.id !== selectedMemory.id &&
        m.tags.some((tag) => selectedMemory.tags.includes(tag)),
    );
  }, [selectedMemory, memories]);

  const handleMemoryUpdate = useCallback((updatedMemory: Memory) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === updatedMemory.id ? updatedMemory : m)),
    );
    setSelectedMemory(updatedMemory);
    setSearchResults((prev) =>
      prev
        ? prev.map((m) =>
            m.id === updatedMemory.id
              ? { ...updatedMemory, relevanceScore: m.relevanceScore }
              : m,
          )
        : null,
    );
  }, []);

  const handleMemoryDelete = useCallback((deletedId: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== deletedId));
    setSearchResults((prev) =>
      prev ? prev.filter((m) => m.id !== deletedId) : null,
    );
  }, []);

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
            <div
              key={i}
              className="p-4 border-t border-black/10 dark:border-white/10"
            >
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
      <div className="relative">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search memories semantically..."
          className="h-12 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 pr-10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <Spinner size="sm" className="text-neutral-400" />
          ) : (
            <IconSearch
              className="text-neutral-400 dark:text-neutral-600"
              size={20}
              stroke={1.5}
            />
          )}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Filter by tags:
          </span>
          {allTags.map((item) => (
            <Badge
              key={item.tag}
              className={`cursor-pointer transition-all ${
                selectedTags.includes(item.tag)
                  ? "bg-black dark:bg-white text-white dark:text-black border border-transparent"
                  : "bg-black/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10"
              }`}
              onClick={() => toggleTag(item.tag)}
            >
              {item.tag}
              <span
                className={`ml-1 ${
                  selectedTags.includes(item.tag)
                    ? "text-white/70 dark:text-black/70"
                    : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                ({item.count})
              </span>
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={clearTagFilters}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <IconX size={14} />
              Clear
            </button>
          )}
        </div>
      )}

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

      {(!isShowingSearchResults || displayData.length > 0) && (
        <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                <TableHead className="text-neutral-500 font-medium">
                  TITLE
                </TableHead>
                <TableHead
                  className={`text-neutral-500 font-medium w-24 ${isShowingSearchResults ? "" : "hidden"}`}
                >
                  SCORE
                </TableHead>
                <TableHead className="text-neutral-500 font-medium hidden md:table-cell">
                  TAGS
                </TableHead>
                <TableHead className="text-neutral-500 font-medium">
                  CREATED
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((item) => (
                <TableRow
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                >
                  <TableCell className="py-5">
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {item.title}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`py-5 ${isShowingSearchResults ? "" : "hidden"}`}
                  >
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
                        {Math.round(
                          ("relevanceScore" in item ? item.relevanceScore : 0) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-5 hidden md:table-cell">
                    <div className="flex gap-2 flex-wrap">
                      {item.tags.map((tag) => (
                        <Badge
                          key={tag}
                          className="bg-black/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border border-black/10 dark:border-white/10 text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="py-5">
                    <span className="text-sm text-neutral-500">
                      {formatDate(item.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
