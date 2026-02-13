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
import { IconPlus, IconX } from "@tabler/icons-react";

export default function AddMemoryModal() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ title, content, tags });
    setOpen(false);
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
        <Button className="bg-black dark:bg-white text-white dark:text-black font-medium">
          <IconPlus size={18} />
          Add Memory
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10">
        <DialogHeader className="border-b border-black/10 dark:border-white/10 pb-4">
          <DialogTitle className="text-xl font-semibold text-black dark:text-white">
            Add Memory
          </DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            Store a new memory in your vault
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Title
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your memory"
              className="h-10 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Content
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your memory content here..."
              rows={6}
              className="bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Tags
            </label>
            <Input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Type a tag and press Enter"
              className="h-10 bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] focus-visible:border-black/30 dark:focus-visible:border-white/30"
            />
            {tags.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-3">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 gap-1 pr-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-neutral-500 hover:text-black dark:hover:text-white"
                    >
                      <IconX size={14} />
                    </button>
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
                className="bg-black/5 dark:bg-white/5 text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="bg-black dark:bg-white text-white dark:text-black font-medium"
            >
              Save Memory
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
