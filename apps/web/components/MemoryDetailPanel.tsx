"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Card,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconEdit,
  IconTrash,
  IconX,
  IconCheck,
  IconLoader2,
  IconHistory,
} from "@tabler/icons-react";
import { buildTagStats, type Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import RelatedMemories from "@/components/_components/RelatedMemories";

interface MemoryDetailPanelProps {
  memory: Memory;
  onClose: () => void;
  onMemoryUpdate: (memory: Memory) => void;
  onMemoryDelete: (id: string) => void;
  onSelectRelated: (memory: Memory) => void;
  startInEditMode?: boolean;
  startWithDelete?: boolean;
  onConsumeAction?: () => void;
}

export default function MemoryDetailPanel({
  memory,
  onClose,
  onMemoryUpdate,
  onMemoryDelete,
  onSelectRelated,
  startInEditMode = false,
  startWithDelete = false,
  onConsumeAction,
}: MemoryDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const { memories, updateMemory, deleteMemory } = useMemoryContext();
  const allTags = useMemo(() => buildTagStats(memories), [memories]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemoryFormValues>({
    resolver: zodResolver(memorySchema),
    defaultValues: { title: "", content: "", tags: [] },
  });

  const editTags = watch("tags");

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
    reset({
      title: memory.title,
      content: memory.content,
      tags: [...memory.tags],
    });
    setIsEditing(true);
  }, [memory, reset]);

  useEffect(() => {
    if (startInEditMode) {
      startEditing();
      onConsumeAction?.();
    } else if (startWithDelete) {
      setShowDeleteConfirm(true);
      onConsumeAction?.();
    }
  }, [startInEditMode, startWithDelete, startEditing, onConsumeAction]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setNewTag("");
    reset();
  }, [reset]);

  const onSave = async (data: MemoryFormValues) => {
    try {
      const updated = await updateMemory({
        id: memory.id,
        title: data.title,
        content: data.content,
        tags: data.tags,
      });

      if (!updated) {
        throw new Error("Memory not found");
      }

      onMemoryUpdate(updated);
      setIsEditing(false);
      toast.success("Memory updated successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update memory",
      );
    }
  };

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);

    try {
      const deleted = await deleteMemory(memory.id);
      if (!deleted) {
        throw new Error("Memory not found");
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
  }, [memory, onMemoryDelete, onClose, deleteMemory]);

  const handleTagKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    onChange: (tags: string[]) => void,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const tag = newTag.trim().toLowerCase();
      if (tag && !editTags.includes(tag)) {
        onChange([...editTags, tag]);
        setNewTag("");
        setShowSuggestions(false);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (
    tag: string,
    onChange: (tags: string[]) => void,
  ) => {
    if (!editTags.includes(tag)) {
      onChange([...editTags, tag]);
    }
    setNewTag("");
    setShowSuggestions(false);
    tagInputRef.current?.focus();
  };

  const removeTag = (
    tagToRemove: string,
    onChange: (tags: string[]) => void,
  ) => {
    onChange(editTags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <>
      <Card className="p-4 sm:p-5 space-y-4 sm:space-y-5 lg:sticky lg:top-4">
        <div className="flex items-start justify-between gap-3">
          {isEditing ? (
            <Input
              {...register("title")}
              placeholder="Memory title"
              disabled={isSubmitting}
              className="h-10 bg-muted/50 border-border text-foreground text-lg font-semibold hover:bg-accent focus-visible:border-ring flex-1"
            />
          ) : (
            <h3 className="text-lg font-semibold text-foreground flex-1">
              {memory.title}
            </h3>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground flex-shrink-0"
          >
            <IconX size={18} />
          </Button>
        </div>

        <div>
          {isEditing ? (
            <>
              <Textarea
                {...register("content")}
                placeholder="Memory content"
                rows={6}
                disabled={isSubmitting}
                className="bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
              />
              {errors.content && (
                <p className="text-sm text-destructive mt-1">
                  {errors.content.message}
                </p>
              )}
            </>
          ) : (
            <p className="text-foreground whitespace-pre-wrap text-sm">
              {memory.content}
            </p>
          )}
        </div>

        <div>
          {isEditing ? (
            <Controller
              name="tags"
              control={control}
              render={({ field }) => (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {field.value.map((tag) => (
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
                          onClick={() => removeTag(tag, field.onChange)}
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
                      onKeyDown={(e) => handleTagKeyDown(e, field.onChange)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="Add a tag and press Enter"
                      disabled={isSubmitting}
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
                            onClick={() =>
                              selectSuggestion(item.tag, field.onChange)
                            }
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
              )}
            />
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
                <span className="text-sm text-muted-foreground">No tags</span>
              )}
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {formatDate(memory.createdAt)}
        </p>

        {!isEditing && (
          <RelatedMemories
            memoryId={memory.id}
            onSelectRelated={onSelectRelated}
          />
        )}

        <div className="flex justify-between border-t border-border pt-4">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                onClick={cancelEditing}
                disabled={isSubmitting}
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit(onSave)}
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground"
              >
                {isSubmitting ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconCheck size={16} />
                )}
                {isSubmitting ? "Saving..." : "Save Changes"}
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
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    router.push(`/timeline?mode=history&memoryId=${memory.id}`)
                  }
                  className="text-muted-foreground"
                >
                  <IconHistory size={16} />
                </Button>
                <Button
                  onClick={startEditing}
                  className="bg-primary text-primary-foreground"
                >
                  <IconEdit size={16} />
                  Edit
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(value) => {
          if (!value) setShowDeleteConfirm(false);
        }}
      >
        <DialogContent className="max-w-sm">
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
