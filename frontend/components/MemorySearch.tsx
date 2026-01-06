"use client";

import { useState, useEffect } from "react";
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
} from "@heroui/react";
import { IconSearch, IconAlertCircle, IconMoodEmpty } from "@tabler/icons-react";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface ApiResponse {
  success: boolean;
  data: Memory[];
  count: number;
  error?: string;
}

export default function MemorySearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const filteredMemories = memories.filter(
    (memory) =>
      memory.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      memory.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

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
        onValueChange={setSearchQuery}
        placeholder="Search memories semantically..."
        size="lg"
        endContent={
          <IconSearch
            className="text-neutral-400 dark:text-neutral-600"
            size={20}
            stroke={1.5}
          />
        }
        classNames={{
          inputWrapper:
            "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
          input: "text-black dark:text-white",
        }}
      />

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
          <TableColumn className="hidden md:table-cell">TAGS</TableColumn>
          <TableColumn>CREATED</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No memories match your search">
          {filteredMemories.map((memory) => (
            <TableRow key={memory.id}>
              <TableCell>
                <span className="text-neutral-800 dark:text-neutral-200">
                  {memory.title}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex gap-2 flex-wrap">
                  {memory.tags.map((tag) => (
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
                  {formatDate(memory.createdAt)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
