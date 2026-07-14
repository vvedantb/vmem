"use client";

import { useCallback, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Textarea, Badge } from "@vmem/ui";
import { toast } from "sonner";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import TagInputWithSuggestions from "./TagInputWithSuggestions";
import MemoryProvenance from "./MemoryProvenance";
import { DetailSection } from "./detail-panel/DetailSection";

interface DetailsTabProps {
  memory: Memory;
  onMemoryUpdate: (memory: Memory) => void;
  isEditing: boolean;
  onIsEditingChange: (editing: boolean) => void;
}

export default function DetailsTab({
  memory,
  onMemoryUpdate,
  isEditing,
  onIsEditingChange,
}: DetailsTabProps) {
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

  useEffect(() => {
    if (isEditing) {
      reset({
        title: memory.title,
        content: memory.content,
        tags: [...memory.tags],
      });
    }
  }, [isEditing, memory, reset]);

  const cancelEditing = useCallback(() => {
    onIsEditingChange(false);
    reset();
  }, [onIsEditingChange, reset]);

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
      onIsEditingChange(false);
      toast.success("Memory updated successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update memory",
      );
    }
  };

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden pb-2">
      {isEditing ? (
        <div className="space-y-3 rounded-lg bg-surface-secondary/60 p-4">
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
        <div className="min-w-0 overflow-hidden rounded-lg bg-surface-secondary/60 p-4">
          <p className="overflow-wrap-anywhere whitespace-pre-wrap text-[15px] leading-relaxed text-pretty text-foreground">
            {memory.content}
          </p>
        </div>
      )}

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

      {isEditing ? (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-surface-primary pt-3">
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
        </div>
      ) : null}
    </div>
  );
}
