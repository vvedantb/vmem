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
          className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-border"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
            {isEditing ? (
              <DialogTitle className="flex-1">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Memory title"
                  disabled={isSaving}
                  className="h-10 bg-muted/50 border-border text-foreground text-lg font-semibold hover:bg-accent focus-visible:border-ring"
                />
              </DialogTitle>
            ) : (
              <DialogTitle className="text-foreground text-lg font-semibold">
                {memory.title}
              </DialogTitle>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleClose}
              className="text-muted-foreground flex-shrink-0"
            >
              <IconX size={18} />
            </Button>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Content
              </h4>
              {isEditing ? (
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Memory content"
                  rows={6}
                  disabled={isSaving}
                  className="bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
                />
              ) : (
                <p className="text-foreground whitespace-pre-wrap">
                  {memory.content}
                </p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Tags
              </h4>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {editTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-muted border-border text-muted-foreground text-xs gap-1 pr-1"
                      >
                        {tag}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeTag(tag)}
                          className="h-auto w-auto p-0 text-muted-foreground hover:text-foreground"
                        >
                          <IconX size={14} />
                        </Button>
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
                      className="h-8 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                        {filteredSuggestions.slice(0, 5).map((item) => (
                          <Button
                            key={item.tag}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => selectSuggestion(item.tag)}
                            className="w-full h-auto px-3 py-1.5 text-left flex items-center justify-between hover:bg-accent transition-colors"
                          >
                            <span className="text-sm text-foreground">
                              {item.tag}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.count}
                            </span>
                          </Button>
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
                        className="bg-muted border-border text-muted-foreground text-xs"
                      >
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No tags
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Created
              </h4>
              <p className="text-muted-foreground">
                {formatDate(memory.createdAt)}
              </p>
            </div>

            {!isEditing && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Related Memories
                </h4>
                {relatedMemories.length > 0 ? (
                  <div className="space-y-2">
                    {relatedMemories.map((related) => {
                      const sharedTags = related.tags.filter((tag) =>
                        memory.tags.includes(tag),
                      );
                      return (
                        <Button
                          key={related.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectRelated(related)}
                          className="w-full h-auto text-left p-3 rounded-lg bg-muted/50 border border-border hover:bg-accent transition-colors justify-start items-start flex-col"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {related.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {sharedTags.length} shared tag
                            {sharedTags.length !== 1 ? "s" : ""}:{" "}
                            {sharedTags.join(", ")}
                          </p>
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No related memories found
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between border-t border-border pt-4">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-primary text-primary-foreground"
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
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <IconTrash size={16} />
                  Delete
                </Button>
                <Button
                  onClick={startEditing}
                  className="bg-primary text-primary-foreground"
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
        <DialogContent className="max-w-sm bg-card border border-border">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">Delete Memory</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2">
            Are you sure you want to delete &quot;{memory.title}&quot;? This
            action cannot be undone.
          </p>
          <DialogFooter className="border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="text-muted-foreground"
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
