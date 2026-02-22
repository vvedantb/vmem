"use client";

import { useState } from "react";
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

export default function AddMemoryModal() {
  const { createMemory } = useMemoryContext();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setTagInput("");
    setTags([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (!content.trim()) {
      toast.error("Please enter content");
      return;
    }

    setIsSubmitting(true);

    try {
      await createMemory({
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      toast.success("Memory saved");
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save memory",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) resetForm();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground font-medium">
          <IconPlus size={18} />
          Add Memory
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-card border border-border">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Add Memory
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Store a new memory in your vault
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Title
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your memory"
              disabled={isSubmitting}
              className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Content
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your memory content here..."
              rows={6}
              disabled={isSubmitting}
              className="bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Tags
            </label>
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Type a tag and press Enter"
              disabled={isSubmitting}
              className="h-10 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
            />
            {tags.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {tags.map((tag) => (
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
                      onClick={() => removeTag(tag)}
                      className="h-auto w-auto p-0 text-muted-foreground hover:text-foreground"
                    >
                      <IconX size={14} />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

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
