"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Badge,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconEdit,
  IconTrash,
  IconX,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface TagStats {
  tag: string;
  count: number;
}

interface MemoryDetailModalProps {
  isOpen: boolean;
  memory: Memory | null;
  onClose: () => void;
  onMemoryUpdate: (memory: Memory) => void;
  onMemoryDelete: (id: string) => void;
  relatedMemories: Memory[];
  onSelectRelated: (memory: Memory) => void;
}

export default function MemoryDetailModal({
  isOpen,
  memory,
  onClose,
  onMemoryUpdate,
  onMemoryDelete,
  relatedMemories,
  onSelectRelated,
}: MemoryDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const [allTags, setAllTags] = useState<TagStats[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch("/api/memories/tags");
        const data = await response.json();
        if (data.success) {
          setAllTags(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch tags:", error);
      }
    };
    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  const filteredSuggestions = useMemo(() => {
    if (!newTag.trim()) return allTags.filter((t) => !editTags.includes(t.tag));
    const input = newTag.toLowerCase();
    return allTags.filter(
      (t) => t.tag.includes(input) && !editTags.includes(t.tag),
    );
  }, [newTag, allTags, editTags]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const startEditing = useCallback(() => {
    if (memory) {
      setEditTitle(memory.title);
      setEditContent(memory.content);
      setEditTags([...memory.tags]);
      setIsEditing(true);
    }
  }, [memory]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditTitle("");
    setEditContent("");
    setEditTags([]);
    setNewTag("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!memory) return;

    if (!editTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    if (!editContent.trim()) {
      toast.error("Content cannot be empty");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          tags: editTags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update memory");
      }

      onMemoryUpdate(data.data);
      setIsEditing(false);
      toast.success("Memory updated successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update memory",
      );
    } finally {
      setIsSaving(false);
    }
  }, [memory, editTitle, editContent, editTags, onMemoryUpdate]);

  const handleDelete = useCallback(async () => {
    if (!memory) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/memories/${memory.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete memory");
      }

      onMemoryDelete(memory.id);
      setShowDeleteConfirm(false);
      onClose();
      toast.success("Memory deleted successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete memory",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [memory, onMemoryDelete, onClose]);

  const addTag = useCallback(() => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
      setNewTag("");
      setShowSuggestions(false);
    }
  }, [newTag, editTags]);

  const selectSuggestion = useCallback(
    (tag: string) => {
      if (!editTags.includes(tag)) {
        setEditTags([...editTags, tag]);
      }
      setNewTag("");
      setShowSuggestions(false);
      tagInputRef.current?.focus();
    },
    [editTags],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      setEditTags(editTags.filter((tag) => tag !== tagToRemove));
    },
    [editTags],
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [addTag],
  );

  const handleClose = useCallback(() => {
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setEditTitle("");
    setEditContent("");
    setEditTags([]);
    setNewTag("");
    onClose();
  }, [onClose]);

  if (!memory) return null;

  return (
    <>
      <Dialog
        open={isOpen && !showDeleteConfirm}
        onOpenChange={(value) => {
          if (!value) handleClose();
        }}
      >
        <DialogContent
          hideCloseButton
          className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4">
            {isEditing ? (
              <DialogTitle className="flex-1">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Memory title"
                  disabled={isSaving}
                  className="h-10 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white text-lg font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
                />
              </DialogTitle>
            ) : (
              <DialogTitle className="text-neutral-800 dark:text-neutral-200 text-lg font-semibold">
                {memory.title}
              </DialogTitle>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              className="text-neutral-500 flex-shrink-0"
            >
              <IconX size={18} />
            </Button>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div>
              <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                Content
              </h4>
              {isEditing ? (
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Memory content"
                  rows={6}
                  disabled={isSaving}
                  className="bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
                />
              ) : (
                <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                  {memory.content}
                </p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                Tags
              </h4>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {editTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400 text-xs gap-1 pr-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                        >
                          <IconX size={14} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="relative">
                    <Input
                      ref={tagInputRef}
                      value={newTag}
                      onChange={(e) => {
                        setNewTag(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onKeyDown={handleTagKeyDown}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="Add a tag and press Enter"
                      disabled={isSaving}
                      className="h-8 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 max-h-32 overflow-y-auto rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg">
                        {filteredSuggestions.slice(0, 5).map((item) => (
                          <button
                            key={item.tag}
                            type="button"
                            onClick={() => selectSuggestion(item.tag)}
                            className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <span className="text-sm text-neutral-800 dark:text-neutral-200">
                              {item.tag}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {item.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {memory.tags.length > 0 ? (
                    memory.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400 text-xs"
                      >
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-400 dark:text-neutral-500">
                      No tags
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                Created
              </h4>
              <p className="text-neutral-600 dark:text-neutral-400">
                {formatDate(memory.createdAt)}
              </p>
            </div>

            {!isEditing && (
              <div>
                <h4 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  Related Memories
                </h4>
                {relatedMemories.length > 0 ? (
                  <div className="space-y-2">
                    {relatedMemories.map((related) => {
                      const sharedTags = related.tags.filter((tag) =>
                        memory.tags.includes(tag),
                      );
                      return (
                        <button
                          key={related.id}
                          onClick={() => onSelectRelated(related)}
                          className="w-full text-left p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                        >
                          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                            {related.title}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            {sharedTags.length} shared tag
                            {sharedTags.length !== 1 ? "s" : ""}:{" "}
                            {sharedTags.join(", ")}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    No related memories found
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between border-t border-black/10 dark:border-white/10 pt-4">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="text-neutral-600 dark:text-neutral-400"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-black dark:bg-white text-white dark:text-black"
                >
                  {isSaving ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconCheck size={16} />
                  )}
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  <IconTrash size={16} />
                  Delete
                </Button>
                <Button
                  onClick={startEditing}
                  className="bg-black dark:bg-white text-white dark:text-black"
                >
                  <IconEdit size={16} />
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(value) => {
          if (!value) setShowDeleteConfirm(false);
        }}
      >
        <DialogContent className="max-w-sm bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10">
          <DialogHeader className="border-b border-black/10 dark:border-white/10 pb-4">
            <DialogTitle className="text-neutral-800 dark:text-neutral-200">
              Delete Memory
            </DialogTitle>
          </DialogHeader>
          <p className="text-neutral-600 dark:text-neutral-400 py-2">
            Are you sure you want to delete &quot;{memory.title}&quot;? This
            action cannot be undone.
          </p>
          <DialogFooter className="border-t border-black/10 dark:border-white/10 pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
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
    </>
  );
}
