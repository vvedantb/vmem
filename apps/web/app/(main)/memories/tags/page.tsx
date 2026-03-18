"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconEdit,
  IconTrash,
  IconLoader2,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import TagCloud from "@/components/TagCloud";
import { useRouter } from "next/navigation";
import { buildTagStats } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

export default function TagsPage() {
  const router = useRouter();
  const { memories, isLoading, updateMemory } = useMemoryContext();
  const tags = useMemo(() => buildTagStats(memories), [memories]);

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTag, setDeleteTag] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTagClick = useCallback(
    (tag: string) => {
      router.push(`/memories/list?tag=${encodeURIComponent(tag)}`);
    },
    [router],
  );

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

      toast.success(`Tag renamed to "${normalizedNew}"`);
      cancelEditing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename tag");
    } finally {
      setIsSaving(false);
    }
  }, [editingTag, newTagName, memories, tags, updateMemory, cancelEditing]);

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

      toast.success(`Tag "${deleteTag}" deleted from all memories`);
      setDeleteTag(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTag, memories, updateMemory]);

  if (isLoading) {
    return (
      <PageContainer title="Memories">
        <div className="space-y-8">
          <div>
            <Skeleton className="h-8 w-48 rounded mb-2" />
            <Skeleton className="h-4 w-96 rounded" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  const totalMemoriesWithTags = tags.reduce((sum, tag) => sum + tag.count, 0);

  return (
    <PageContainer title="Memories">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Tag Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View, edit, and manage your memory tags
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-xl border border-border bg-muted/50">
            <p className="text-sm text-muted-foreground">Total Tags</p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {tags.length}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-muted/50">
            <p className="text-sm text-muted-foreground">Tag Uses</p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {totalMemoriesWithTags}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-muted/50">
            <p className="text-sm text-muted-foreground">Avg Tags/Memory</p>
            <p className="text-2xl font-semibold text-foreground mt-1">
              {tags.length > 0
                ? (totalMemoriesWithTags / tags.length).toFixed(1)
                : "0"}
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-foreground mb-4">
            Tag Cloud
          </h2>
          <TagCloud tags={tags} onTagClick={handleTagClick} />
        </div>

        <div>
          <h2 className="text-lg font-medium text-foreground mb-4">All Tags</h2>
          {tags.length === 0 ? (
            <div className="p-8 text-center border border-border rounded-xl">
              <p className="text-sm text-muted-foreground">
                No tags found. Add tags to your memories to manage them here.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>TAG</TableHead>
                    <TableHead className="hidden sm:table-cell w-32">
                      MEMORIES
                    </TableHead>
                    <TableHead className="w-12 sm:w-48 text-right">
                      ACTIONS
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.map((item) => (
                    <TableRow key={item.tag}>
                      <TableCell>
                        {editingTag === item.tag ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              disabled={isSaving}
                              className="h-8 bg-muted/50 border-border text-foreground"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTag();
                                if (e.key === "Escape") cancelEditing();
                              }}
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={handleSaveTag}
                              disabled={isSaving}
                              className="text-success"
                            >
                              {isSaving ? (
                                <IconLoader2
                                  size={16}
                                  className="animate-spin"
                                />
                              ) : (
                                <IconCheck size={16} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="text-muted-foreground"
                            >
                              <IconX size={16} />
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <span className="text-foreground">{item.tag}</span>
                            <span className="text-xs text-muted-foreground sm:hidden ml-2">
                              ({item.count})
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-muted-foreground tabular-nums">
                          {item.count}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editingTag !== item.tag && (
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => startEditing(item.tag)}
                              className="text-muted-foreground sm:hidden"
                              aria-label="Edit tag"
                            >
                              <IconEdit size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteTag(item.tag)}
                              className="text-destructive sm:hidden"
                              aria-label="Delete tag"
                            >
                              <IconTrash size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(item.tag)}
                              className="text-muted-foreground hidden sm:inline-flex"
                            >
                              <IconEdit size={14} />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTag(item.tag)}
                              className="text-destructive hidden sm:inline-flex"
                            >
                              <IconTrash size={14} />
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Dialog
          open={!!deleteTag}
          onOpenChange={(open) => !open && setDeleteTag(null)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-foreground">Delete Tag</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Are you sure you want to delete the tag &quot;{deleteTag}&quot;?
                This will remove it from all memories. The memories themselves
                will not be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDeleteTag(null)}
                disabled={isDeleting}
                className="text-muted-foreground"
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
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
