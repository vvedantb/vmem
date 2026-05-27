"use client";

import { useState, useMemo, useCallback } from "react";
import { useAction } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Badge,
  cn,
} from "@vmem/ui";
import { IconLink, IconLoader2, IconSearch } from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import {
  formatMemorySourceLabel,
  formatMemoryTypeLabel,
  timeAgo,
  type Memory,
} from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { DetailEmptyState } from "@/components/_components/detail-panel/DetailEmptyState";

const TAGS_PREVIEW = 2;
const ROW_HEIGHT = 84;
const LIST_HEIGHT = 280;

interface LinkMemoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMemoryId: string;
  excludeIds: Set<string>;
  onLinked: () => void;
}

function memoryMatchesSearch(memory: Memory, query: string): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  return (
    memory.title.toLowerCase().includes(q) ||
    memory.content.toLowerCase().includes(q) ||
    memory.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

function LinkMemoryRow({
  memory,
  isLinking,
  isDisabled,
  onLink,
}: {
  memory: Memory;
  isLinking: boolean;
  isDisabled: boolean;
  onLink: (id: string) => void;
}) {
  return (
    <div className="pb-2">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => onLink(memory.id)}
        className={cn(
          "flex w-full min-w-0 flex-col gap-2 rounded-lg bg-surface-secondary p-3 text-left transition-[background-color]",
          "hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {memory.title}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted">
              {memory.content}
            </p>
          </div>
          {isLinking ? (
            <IconLoader2
              size={16}
              className="mt-0.5 shrink-0 animate-spin text-muted"
            />
          ) : (
            <IconLink
              size={16}
              className="mt-0.5 shrink-0 text-muted"
              stroke={1.5}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="h-5 text-[10px] font-normal">
            {formatMemoryTypeLabel(memory.type)}
          </Badge>
          <Badge variant="outline" className="h-5 text-[10px] font-normal">
            {formatMemorySourceLabel(memory.source)}
          </Badge>
          <span className="text-[11px] text-muted tabular-nums">
            {timeAgo(memory.createdAt)}
          </span>
          {memory.tags.slice(0, TAGS_PREVIEW).map((tag) => (
            <Badge key={tag} variant="secondary" className="h-5 text-[10px]">
              {tag}
            </Badge>
          ))}
          {memory.tags.length > TAGS_PREVIEW ? (
            <Badge variant="secondary" className="h-5 text-[10px] tabular-nums">
              +{memory.tags.length - TAGS_PREVIEW}
            </Badge>
          ) : null}
        </div>
      </button>
    </div>
  );
}

export default function LinkMemoryModal({
  open,
  onOpenChange,
  currentMemoryId,
  excludeIds,
  onLinked,
}: LinkMemoryModalProps) {
  const linkMemories = useAction(api.relationshipApi.linkMemories);
  const { memories } = useMemoryContext();
  const [search, setSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const linkableMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (memory.id === currentMemoryId) return false;
      if (excludeIds.has(memory.id)) return false;
      return true;
    });
  }, [memories, currentMemoryId, excludeIds]);

  const filteredMemories = useMemo(() => {
    const query = search.trim();
    return linkableMemories.filter((memory) =>
      memoryMatchesSearch(memory, query),
    );
  }, [linkableMemories, search]);

  const handleLink = useCallback(
    async (selectedId: string) => {
      setLinkingId(selectedId);
      try {
        await linkMemories({
          memoryIdA: currentMemoryId,
          memoryIdB: selectedId,
          reason: "user linked",
        });
        toast.success("Memory linked");
        onLinked();
        onOpenChange(false);
        setSearch("");
      } catch {
        toast.error("Failed to link memory");
      }
      setLinkingId(null);
    },
    [currentMemoryId, linkMemories, onLinked, onOpenChange],
  );

  const closeModal = useCallback(
    (value: boolean) => {
      onOpenChange(value);
      if (!value) setSearch("");
    },
    [onOpenChange],
  );

  const hasQuery = search.trim().length > 0;
  const isLinking = linkingId !== null;

  return (
    <Dialog open={open} onOpenChange={closeModal}>
      <DialogContent className="flex max-h-[min(32rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1.5 px-6 pb-4 pt-6">
          <DialogTitle className="text-foreground">Link memory</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            Choose a memory to connect. Linked memories appear in the
            Connections tab.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
          <div className="space-y-2">
            <div className="relative">
              <IconSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={16}
                stroke={1.5}
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, content, or tag…"
                className="h-10 rounded-field border-border bg-field-background pl-9 text-foreground placeholder:text-field-placeholder"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted tabular-nums">
              {filteredMemories.length === 0
                ? hasQuery
                  ? "No matches"
                  : "Nothing left to link"
                : `${filteredMemories.length} ${
                    filteredMemories.length === 1 ? "memory" : "memories"
                  } available`}
            </p>
          </div>

          {linkableMemories.length === 0 ? (
            <DetailEmptyState
              icon={IconLink}
              title="All set"
              description="Every other memory is already linked to this one."
            />
          ) : filteredMemories.length === 0 ? (
            <DetailEmptyState
              icon={IconSearch}
              title="No matches"
              description="Try a different title, tag, or phrase from the memory body."
            />
          ) : (
            <div className="min-h-0 flex-1 rounded-lg bg-surface p-2">
              <Virtuoso
                data={filteredMemories}
                computeItemKey={(_index, memory) => memory.id}
                defaultItemHeight={ROW_HEIGHT}
                itemContent={(_index, memory) => (
                  <LinkMemoryRow
                    memory={memory}
                    isLinking={linkingId === memory.id}
                    isDisabled={isLinking}
                    onLink={handleLink}
                  />
                )}
                style={{ height: LIST_HEIGHT }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
