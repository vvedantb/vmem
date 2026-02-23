"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Textarea,
  Badge,
} from "@vmem/ui";
import { IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";

export default function AddMemoryModal() {
  const { createMemory } = useMemoryContext();
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

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

  const currentTags = watch("tags");

  const handleAddTag = (
    e: React.KeyboardEvent<HTMLInputElement>,
    onChange: (tags: string[]) => void,
  ) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!currentTags.includes(tagInput.trim().toLowerCase())) {
        onChange([...currentTags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (
    tagToRemove: string,
    onChange: (tags: string[]) => void,
  ) => {
    onChange(currentTags.filter((tag) => tag !== tagToRemove));
  };

  const handleClose = () => {
    reset();
    setTagInput("");
  };

  const onSubmit = async (data: MemoryFormValues) => {
    try {
      await createMemory(data);
      toast.success("Memory saved");
      reset();
      setTagInput("");
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save memory",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground font-medium">
          <IconPlus size={18} />
          Add Memory
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Add Memory
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Store a new memory in your vault
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Title
            </label>
            <Input
              type="text"
              {...register("title")}
              placeholder="Enter a title for your memory"
              disabled={isSubmitting}
              className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Content
            </label>
            <Textarea
              {...register("content")}
              placeholder="Write your memory content here..."
              rows={6}
              disabled={isSubmitting}
              className="bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
            {errors.content && (
              <p className="text-sm text-destructive">
                {errors.content.message}
              </p>
            )}
          </div>

          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-muted-foreground">
                  Tags
                </label>
                <Input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => handleAddTag(e, field.onChange)}
                  placeholder="Type a tag and press Enter"
                  disabled={isSubmitting}
                  className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
                />
                {field.value.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {field.value.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="bg-muted border-border text-foreground gap-1 pr-1"
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
                )}
              </div>
            )}
          />

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="bg-muted text-foreground"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-primary-foreground font-medium"
            >
              {isSubmitting ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Memory"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
