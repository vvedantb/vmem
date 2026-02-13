"use client";

import { useState, useEffect, useCallback } from "react";
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
  IconAlertCircle,
  IconEdit,
  IconTrash,
  IconLoader2,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import TagCloud from "@/components/TagCloud";
import { useRouter } from "next/navigation";

interface TagStats {
  tag: string;
  count: number;
}

export default function TagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTag, setDeleteTag] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTags = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/memories/tags");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch tags");
      }

      setTags(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tags");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

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

    if (tags.some((t) => t.tag === normalizedNew)) {
      toast.error(`Tag "${normalizedNew}" already exists`);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/memories/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldTag: editingTag, newTag: normalizedNew }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to rename tag");
      }

      toast.success(`Tag renamed to "${normalizedNew}"`);
      await fetchTags();
      cancelEditing();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename tag");
    } finally {
      setIsSaving(false);
    }
  }, [editingTag, newTagName, tags, fetchTags, cancelEditing]);

  const handleDeleteTag = useCallback(async () => {
    if (!deleteTag) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/memories/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: deleteTag }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete tag");
      }

      toast.success(`Tag "${deleteTag}" deleted from all memories`);
      await fetchTags();
      setDeleteTag(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tag");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTag, fetchTags]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48 rounded mb-2" />
          <Skeleton className="h-4 w-96 rounded" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <IconAlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          Failed to load tags
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {error}
        </p>
        <button
          onClick={() => {
            setIsLoading(true);
            fetchTags();
          }}
          className="px-4 py-2 text-sm font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }

  const totalMemoriesWithTags = tags.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200">
          Tag Management
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          View, edit, and manage your memory tags
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Total Tags
          </p>
          <p className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
            {tags.length}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Tag Uses
          </p>
          <p className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
            {totalMemoriesWithTags}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Avg Tags/Memory
          </p>
          <p className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
            {tags.length > 0
              ? (totalMemoriesWithTags / tags.length).toFixed(1)
              : "0"}
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-4">
          Tag Cloud
        </h2>
        <TagCloud tags={tags} onTagClick={handleTagClick} />
      </div>

      <div>
        <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-4">
          All Tags
        </h2>
        {tags.length === 0 ? (
          <div className="p-8 text-center border border-black/10 dark:border-white/10 rounded-xl">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No tags found. Add tags to your memories to manage them here.
            </p>
          </div>
        ) : (
          <div className="border border-black/10 dark:border-white/10 rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TAG</TableHead>
                  <TableHead className="w-32">MEMORIES</TableHead>
                  <TableHead className="w-48 text-right">ACTIONS</TableHead>
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
                            className="h-8 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white"
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
                            className="text-green-600 dark:text-green-400"
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
                            onClick={cancelEditing}
                            disabled={isSaving}
                            className="text-neutral-500"
                          >
                            <IconX size={16} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-neutral-800 dark:text-neutral-200">
                          {item.tag}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {item.count}
                      </span>
                    </TableCell>
                    <TableCell>
                      {editingTag !== item.tag && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(item.tag)}
                            className="text-neutral-600 dark:text-neutral-400"
                          >
                            <IconEdit size={14} />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTag(item.tag)}
                            className="text-red-600 dark:text-red-400"
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
            <DialogTitle className="text-neutral-800 dark:text-neutral-200">
              Delete Tag
            </DialogTitle>
            <DialogDescription className="text-neutral-600 dark:text-neutral-400">
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
              className="text-neutral-600 dark:text-neutral-400"
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
  );
}
