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
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Textarea,
  Badge,
  Label,
} from "@vmem/ui";
import { IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { memorySchema, type MemoryFormValues } from "@/lib/schemas";
import { ProfileDropdown } from "./ProfileDropdown";

export default function AddMemoryModal({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const { createMemory } = useMemoryContext();
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<
    string | undefined
  >();

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
    setSelectedProfileId(undefined);
  };

  const onSubmit = async (data: MemoryFormValues) => {
    try {
      await createMemory({
        ...data,
        profileId: selectedProfileId,
      });
      toast.success("Memory saved");
      reset();
      setTagInput("");
      setSelectedProfileId(undefined);
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
        {trigger ?? (
          <Button className="bg-primary text-primary-foreground font-medium">
            <IconPlus size={18} />
            Add Memory
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground">
            Add Memory
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-2">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Save to</Label>
            <ProfileDropdown
              value={selectedProfileId}
              onChange={setSelectedProfileId}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Input
              type="text"
              {...register("title")}
              placeholder="Title"
              disabled={isSubmitting}
              className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Textarea
              {...register("content")}
              placeholder="Content"
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
                <Input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => handleAddTag(e, field.onChange)}
                  placeholder="Tags (press Enter to add)"
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
                          className="h-5 w-5 p-0.5 -mr-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <IconX size={12} />
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
