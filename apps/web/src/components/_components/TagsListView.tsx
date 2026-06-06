"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@vmem/ui";
import {
  IconCheck,
  IconDotsVertical,
  IconEdit,
  IconLoader2,
  IconMoodEmpty,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { buildTagStats } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useMemoriesSearchParams } from "@/routes/_main/memories/useMemoriesSearchParams";
import { DetailEmptyState } from "@/components/_components/detail-panel/DetailEmptyState";
import { TagMemoriesPanel } from "@/components/_components/TagMemoriesPanel";
import { VmemSpinner } from "@/components/svg-animations";

/**
 * Tag-rows view for /memories/list?view=tags. Clicking a tag opens a right-hand
 * panel listing memories with that tag (same row + detail pattern as the main
 * list). The kebab menu handles rename/delete.
 */
export default function TagsListView() {
  const { memories, isLoading, updateMemory } = useMemoryContext();
  const [params] = useMemoriesSearchParams();

  const scopedMemories = useMemo(() => {
    if (params.profile === null) return memories;
    return memories.filter((m) => m.profileId === params.profile);
  }, [memories, params.profile]);

  const tags = useMemo(() => {
    const stats = buildTagStats(scopedMemories);
    const q = params.q.trim().toLowerCase();
    if (q.length === 0) return stats;
    return stats.filter((s) => s.tag.toLowerCase().includes(q));
  }, [scopedMemories, params.q]);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const selectedTagMemories = useMemo(() => {
    if (!selectedTag) return [];
    return scopedMemories.filter((memory) => memory.tags.includes(selectedTag));
  }, [scopedMemories, selectedTag]);

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTag, setDeleteTag] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag((current) => (current === tag ? null : tag));
  }, []);

  const closeTagPanel = useCallback(() => {
    setSelectedTag(null);
  }, []);

  const startEditing = useCallback((tag: string) => {
    setEditingTag(tag);
    setNewTagName(tag);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingTag(null);
    setNewTagName("");
  }, []);

  const handleSaveTag = useCallback(async () => {
    if (!editingTag || !newTagName.trim()) return;

    const normalizedNew = newTagName.trim().toLowerCase();
    if (normalizedNew === editingTag) {
      cancelEditing();
      return;
    }

    if (tags.some((tag) => tag.tag === normalizedNew)) {
      toast.error(`Tag "${normalizedNew}" already exists`);
      return;
    }

    const affectedMemories = memories.filter((memory) =>
      memory.tags.includes(editingTag),
    );
    if (affectedMemories.length === 0) {
      cancelEditing();
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all(
        affectedMemories.map((memory) => {
          const renamed = memory.tags.map((tag) =>
            tag === editingTag ? normalizedNew : tag,
          );
          return updateMemory({
            id: memory.id,
            tags: Array.from(new Set(renamed)),
          });
        }),
      );

      if (selectedTag === editingTag) {
        setSelectedTag(normalizedNew);
      }

      toast.success(`Tag renamed to "${normalizedNew}"`);
      cancelEditing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename tag");
    } finally {
      setIsSaving(false);
    }
  }, [
    editingTag,
    newTagName,
    memories,
    tags,
    updateMemory,
    cancelEditing,
    selectedTag,
  ]);

  const handleDeleteTag = useCallback(async () => {
    if (!deleteTag) return;

    const affectedMemories = memories.filter((memory) =>
      memory.tags.includes(deleteTag),
    );
    if (affectedMemories.length === 0) {
      setDeleteTag(null);
      return;
    }

    setIsDeleting(true);
    try {
      await Promise.all(
        affectedMemories.map((memory) =>
          updateMemory({
            id: memory.id,
            tags: memory.tags.filter((tag) => tag !== deleteTag),
          }),
        ),
      );

      if (selectedTag === deleteTag) {
        setSelectedTag(null);
      }

      toast.success(`Tag "${deleteTag}" deleted from all memories`);
      setDeleteTag(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTag, memories, updateMemory, selectedTag]);

  if (isLoading && tags.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={20} className="text-muted" />
      </div>
    );
  }

  if (tags.length === 0) {
    const isFiltering = params.q.trim().length > 0 || params.profile !== null;
    return (
      <DetailEmptyState
        icon={IconMoodEmpty}
        title={isFiltering ? "No tags match" : "No tags yet"}
        description={
          isFiltering
            ? "Try a different search or clear the profile filter."
            : "Add tags to memories to start grouping them."
        }
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex min-h-0 flex-1 gap-4",
          selectedTag ? "flex-col lg:flex-row" : "",
        )}
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            selectedTag ? "hidden sm:block" : "",
          )}
        >
          <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
            {tags.map((item) => {
              const isEditing = editingTag === item.tag;
              const isSelected = selectedTag === item.tag;
              return (
                <div key={item.tag} className="pb-1.5">
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2.5 transition-[background-color]",
                      !isEditing && "cursor-pointer hover:bg-surface-tertiary",
                      isSelected && "bg-surface-secondary",
                    )}
                    onClick={
                      isEditing ? undefined : () => handleTagClick(item.tag)
                    }
                  >
                    {isEditing ? (
                      <RenameRow
                        value={newTagName}
                        onChange={setNewTagName}
                        isSaving={isSaving}
                        onSave={handleSaveTag}
                        onCancel={cancelEditing}
                      />
                    ) : (
                      <DisplayRow
                        tag={item.tag}
                        count={item.count}
                        onRename={() => startEditing(item.tag)}
                        onDelete={() => setDeleteTag(item.tag)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {selectedTag && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="min-h-0 w-full overflow-y-auto scrollbar-thin lg:w-[420px] lg:shrink-0"
            >
              <TagMemoriesPanel
                tag={selectedTag}
                memories={selectedTagMemories}
                onClose={closeTagPanel}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dialog
        open={!!deleteTag}
        onOpenChange={(open) => !open && setDeleteTag(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete tag</DialogTitle>
            <DialogDescription>
              Remove the tag &quot;{deleteTag}&quot; from every memory it is
              attached to. The memories themselves stay; only the tag goes away.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTag(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTag}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconTrash size={16} />
              )}
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DisplayRow({
  tag,
  count,
  onRename,
  onDelete,
}: {
  tag: string;
  count: number;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {tag}
      </span>
      <span className="shrink-0 text-xs text-muted tabular-nums">
        {count} {count === 1 ? "memory" : "memories"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for tag ${tag}`}
            className="h-7 w-7 text-muted"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDotsVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={onRename}>
            <IconEdit size={14} stroke={1.5} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-danger focus:text-danger"
          >
            <IconTrash size={14} stroke={1.5} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RenameRow({
  value,
  onChange,
  isSaving,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (next: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        autoFocus
        value={value}
        disabled={isSaving}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        className="h-8"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onSave}
        disabled={isSaving}
        className="text-foreground"
        aria-label="Save tag rename"
      >
        {isSaving ? (
          <IconLoader2 size={16} className="animate-spin" />
        ) : (
          <IconCheck size={16} />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        disabled={isSaving}
        className="text-muted"
        aria-label="Cancel tag rename"
      >
        <IconX size={16} />
      </Button>
    </div>
  );
}
