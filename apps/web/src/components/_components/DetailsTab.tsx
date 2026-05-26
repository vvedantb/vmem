"use client";

import { useState, useCallback, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Textarea, Badge } from "@vmem/ui";
import { toast } from "sonner";
import {
  IconEdit,
  IconTrash,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import TagInputWithSuggestions from "./TagInputWithSuggestions";
import MemoryProvenance from "./MemoryProvenance";

interface DetailsTabProps {
  memory: Memory;
  onMemoryUpdate: (memory: Memory) => void;
  onRequestDelete: () => void;
  onSelectRelated: (memory: Memory) => void;
  startInEditMode: boolean;
  startWithDelete: boolean;
  onConsumeAction?: () => void;
}

export default function DetailsTab({
  memory,
  onMemoryUpdate,
  onRequestDelete,
  startInEditMode,
  startWithDelete,
  onConsumeAction,
}: DetailsTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { updateMemory } = useMemoryContext();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemoryFormValues>({
    resolver: zodResolver(memorySchema),
    defaultValues: { title: "", content: "", tags: [] },
  });

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
      onRequestDelete();
      onConsumeAction?.();
    }
  }, [
    startInEditMode,
    startWithDelete,
    startEditing,
    onConsumeAction,
    onRequestDelete,
  ]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
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

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Content */}
      <div>
        {isEditing ? (
          <>
            <Input
              {...register("title")}
              placeholder="Memory title"
              disabled={isSubmitting}
              className="h-10 bg-surface-secondary/50 border-border text-foreground text-lg font-semibold hover:bg-surface-tertiary focus-visible:border-focus mb-4"
            />
            <Textarea
              {...register("content")}
              placeholder="Memory content"
              rows={6}
              disabled={isSubmitting}
              className="bg-surface-secondary/50 border-border text-foreground hover:bg-surface-tertiary focus-visible:border-focus"
            />
            {errors.content && (
              <p className="text-sm text-danger mt-1">
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

      <MemoryProvenance memory={memory} />

      {/* Tags */}
      <div>
        {isEditing ? (
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TagInputWithSuggestions
                tags={field.value}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {memory.tags.length > 0 ? (
              memory.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="bg-surface-secondary border-border text-muted text-xs"
                >
                  {tag}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted">No tags</span>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted">{formatDate(memory.createdAt)}</p>

      {/* Footer actions */}
      <div className="flex justify-between border-t border-border pt-4">
        {isEditing ? (
          <>
            <Button
              variant="ghost"
              onClick={cancelEditing}
              disabled={isSubmitting}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(onSave)}
              disabled={isSubmitting}
              className="bg-surface-tertiary text-accent-foreground"
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
              onClick={onRequestDelete}
              className="text-danger hover:text-danger hover:bg-danger/10"
            >
              <IconTrash size={16} />
              Delete
            </Button>
            <Button
              onClick={startEditing}
              className="bg-surface-tertiary text-accent-foreground"
            >
              <IconEdit size={16} />
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
