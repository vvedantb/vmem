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
import { formatMemorySourceLabel } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import TagInputWithSuggestions from "./TagInputWithSuggestions";
import MemoryProvenance from "./MemoryProvenance";
import { DetailSection } from "./detail-panel/DetailSection";

interface DetailsTabProps {
  memory: Memory;
  onMemoryUpdate: (memory: Memory) => void;
  onRequestDelete: () => void;
  onSelectRelated: (memory: Memory) => void;
  startInEditMode: boolean;
  startWithDelete: boolean;
  onConsumeAction?: () => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    <div className="space-y-5">
      <DetailSection label="Content">
        {isEditing ? (
          <div className="space-y-3 rounded-lg bg-surface-secondary p-4">
            <Input
              {...register("title")}
              placeholder="Memory title"
              disabled={isSubmitting}
              className="h-10 rounded-field border-border bg-field-background text-foreground text-base font-semibold placeholder:text-field-placeholder"
            />
            <Textarea
              {...register("content")}
              placeholder="Memory content"
              rows={8}
              disabled={isSubmitting}
              className="min-h-[160px] rounded-field border-border bg-field-background text-foreground placeholder:text-field-placeholder"
            />
            {errors.content ? (
              <p className="text-sm text-danger">{errors.content.message}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg bg-surface-secondary p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {memory.content}
            </p>
          </div>
        )}
      </DetailSection>

      <MemoryProvenance memory={memory} />

      <DetailSection label="Tags">
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
        ) : memory.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No tags</p>
        )}
      </DetailSection>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          <span className="text-muted">Created </span>
          <time className="tabular-nums text-foreground">
            {formatDate(memory.createdAt)}
          </time>
        </span>
        <span className="text-muted">·</span>
        <span className="capitalize">{memory.type}</span>
        <span className="text-muted">·</span>
        <span>{formatMemorySourceLabel(memory.source)}</span>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
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
            <Button onClick={handleSubmit(onSave)} disabled={isSubmitting}>
              {isSubmitting ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconCheck size={16} />
              )}
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={onRequestDelete}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              <IconTrash size={16} />
              Delete
            </Button>
            <Button variant="outline" onClick={startEditing}>
              <IconEdit size={16} />
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
