import { useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import {
  Button,
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import {
  IconCheck,
  IconEdit,
  IconLoader2,
  IconMoodEmpty,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { buildTagStats } from "@/lib/memories";
import { IconMemories } from "@/components/icons/sidebar";
import { useMemoryContext } from "@/contexts/MemoryContext";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";
import { DetailEmptyState } from "@/components/_components/detail-panel/DetailEmptyState";
import { TagMemoriesPanel } from "@/components/_components/TagMemoriesPanel";
import { VmemSpinner } from "@/components/icons/animations";

// tag rows view for /memories/list?view=tags
export default function TagsListView() {
  const { memories, isLoading, updateMemory } = useMemoryContext();
  const [params] = useMemoriesSearchParams();

  // the route already scopes memories to the active workspace
  const scopedMemories = memories;

  const stats = buildTagStats(scopedMemories);
  const q = params.q.trim().toLowerCase();
  const tags =
    q.length === 0
      ? stats
      : stats.filter((s) => s.tag.toLowerCase().includes(q));

  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const selectedTagMemories = selectedTag
    ? scopedMemories.filter((memory) => memory.tags.includes(selectedTag))
    : [];

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const { submitting: isSaving, run: runSaveTag } = useAsyncSubmit();

  const [deleteTag, setDeleteTag] = useState<string | null>(null);
  const { submitting: isDeleting, run: runDeleteTag } = useAsyncSubmit();

  const handleTagClick = (tag: string) => {
    setSelectedTag((current) => (current === tag ? null : tag));
  };

  const closeTagPanel = () => {
    setSelectedTag(null);
  };

  const startEditing = (tag: string) => {
    setEditingTag(tag);
    setNewTagName(tag);
  };

  const cancelEditing = () => {
    setEditingTag(null);
    setNewTagName("");
  };

  const handleSaveTag = async () => {
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

    await runSaveTag(async () => {
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
    }, "Failed to rename tag");
  };

  const handleDeleteTag = async () => {
    if (!deleteTag) return;

    const affectedMemories = memories.filter((memory) =>
      memory.tags.includes(deleteTag),
    );
    if (affectedMemories.length === 0) {
      setDeleteTag(null);
      return;
    }

    await runDeleteTag(async () => {
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
    }, "Failed to delete tag");
  };

  if (isLoading && tags.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={20} className="text-muted" />
      </div>
    );
  }

  if (tags.length === 0) {
    const isFiltering = params.q.trim().length > 0;
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
            "min-h-0 min-w-0",
            selectedTag ? "hidden sm:block lg:min-w-0 lg:flex-1" : "flex-1",
          )}
        >
          <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
            {tags.map((item) => {
              const isEditing = editingTag === item.tag;
              const isSelected = selectedTag === item.tag;
              return (
                <div key={item.tag} className="pb-1.5">
                  {isEditing ? (
                    <div className="rounded-lg px-3 py-2.5">
                      <RenameRow
                        value={newTagName}
                        onChange={setNewTagName}
                        isSaving={isSaving}
                        onSave={handleSaveTag}
                        onCancel={cancelEditing}
                      />
                    </div>
                  ) : (
                    <TagRow
                      tag={item.tag}
                      count={item.count}
                      isSelected={isSelected}
                      onClick={() => handleTagClick(item.tag)}
                      onRename={() => startEditing(item.tag)}
                      onDelete={() => setDeleteTag(item.tag)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {selectedTag && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1"
            >
              <TagMemoriesPanel
                key={selectedTag}
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

function TagRow({
  tag,
  count,
  isSelected,
  onClick,
  onRename,
  onDelete,
}: {
  tag: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const rowBody = (
    <div
      className={cn(
        "cursor-pointer rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary",
        isSelected && "bg-surface-secondary",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {tag}
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs tabular-nums",
            isSelected ? "text-foreground" : "text-muted",
          )}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <IconMemories size={14} stroke={1.7} />
          </span>
          {count}
        </span>
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowBody}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <IconEdit size={16} stroke={1.5} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          className="text-danger focus:text-danger data-[highlighted]:text-danger"
          onClick={onDelete}
        >
          <IconTrash size={16} stroke={1.5} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
