"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Skeleton,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
} from "@heroui/react";
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

  // Edit state
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteTag, setDeleteTag] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch tags
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

  // Handle tag click in cloud - navigate to memories filtered by tag
  const handleTagClick = useCallback(
    (tag: string) => {
      // Navigate to memories list - the filter will be applied through URL or state
      router.push(`/memories/list?tag=${encodeURIComponent(tag)}`);
    },
    [router]
  );

  // Start editing a tag
  const startEditing = useCallback((tag: string) => {
    setEditingTag(tag);
    setNewTagName(tag);
  }, []);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingTag(null);
    setNewTagName("");
  }, []);

  // Save edited tag
  const handleSaveTag = useCallback(async () => {
    if (!editingTag || !newTagName.trim()) return;

    const normalizedNew = newTagName.trim().toLowerCase();
    if (normalizedNew === editingTag) {
      cancelEditing();
      return;
    }

    // Check if new tag name already exists
    if (tags.some((t) => t.tag === normalizedNew)) {
      addToast({
        title: "Error",
        description: `Tag "${normalizedNew}" already exists`,
        color: "danger",
      });
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

      addToast({
        title: "Success",
        description: `Tag renamed to "${normalizedNew}"`,
        color: "success",
      });

      // Refresh tags
      await fetchTags();
      cancelEditing();
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to rename tag",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  }, [editingTag, newTagName, tags, fetchTags, cancelEditing]);

  // Handle delete tag
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

      addToast({
        title: "Success",
        description: `Tag "${deleteTag}" deleted from all memories`,
        color: "success",
      });

      // Refresh tags
      await fetchTags();
      setDeleteTag(null);
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete tag",
        color: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTag, fetchTags]);

  // Loading skeleton
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

  // Error state
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-200">
          Tag Management
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          View, edit, and manage your memory tags
        </p>
      </div>

      {/* Stats */}
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

      {/* Tag Cloud */}
      <div>
        <h2 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-4">
          Tag Cloud
        </h2>
        <TagCloud tags={tags} onTagClick={handleTagClick} />
      </div>

      {/* Tag Table */}
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
          <Table
            aria-label="Tags table"
            classNames={{
              wrapper:
                "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
              th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
              td: "py-4",
              tr: "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
            }}
          >
            <TableHeader>
              <TableColumn>TAG</TableColumn>
              <TableColumn className="w-32">MEMORIES</TableColumn>
              <TableColumn className="w-48 text-right">ACTIONS</TableColumn>
            </TableHeader>
            <TableBody>
              {tags.map((item) => (
                <TableRow key={item.tag}>
                  <TableCell>
                    {editingTag === item.tag ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={newTagName}
                          onValueChange={setNewTagName}
                          size="sm"
                          isDisabled={isSaving}
                          classNames={{
                            inputWrapper:
                              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none",
                            input: "text-black dark:text-white",
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveTag();
                            if (e.key === "Escape") cancelEditing();
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          onPress={handleSaveTag}
                          isDisabled={isSaving}
                          className="text-green-600 dark:text-green-400"
                        >
                          {isSaving ? (
                            <IconLoader2 size={16} className="animate-spin" />
                          ) : (
                            <IconCheck size={16} />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="light"
                          onPress={cancelEditing}
                          isDisabled={isSaving}
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
                          size="sm"
                          variant="light"
                          onPress={() => startEditing(item.tag)}
                          startContent={<IconEdit size={14} />}
                          className="text-neutral-600 dark:text-neutral-400"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="light"
                          onPress={() => setDeleteTag(item.tag)}
                          startContent={<IconTrash size={14} />}
                          className="text-red-600 dark:text-red-400"
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTag}
        onClose={() => setDeleteTag(null)}
        size="sm"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader>
            <span className="text-neutral-800 dark:text-neutral-200">
              Delete Tag
            </span>
          </ModalHeader>
          <ModalBody>
            <p className="text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete the tag &quot;{deleteTag}&quot;?
              This will remove it from all memories. The memories themselves
              will not be deleted.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setDeleteTag(null)}
              isDisabled={isDeleting}
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              color="danger"
              onPress={handleDeleteTag}
              isDisabled={isDeleting}
              startContent={
                isDeleting ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconTrash size={16} />
                )
              }
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
