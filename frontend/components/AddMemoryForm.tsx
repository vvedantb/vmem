"use client";

import { useState } from "react";
import { Input, Textarea, Button, Chip } from "@heroui/react";
import { IconX } from "@tabler/icons-react";

export default function AddMemoryForm() {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({ title, content, tags });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Title
        </label>
        <Input
          type="text"
          value={title}
          onValueChange={setTitle}
          placeholder="Enter a title for your memory"
          size="lg"
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Content
        </label>
        <Textarea
          value={content}
          onValueChange={setContent}
          placeholder="Write your memory content here..."
          minRows={8}
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Tags
        </label>
        <Input
          type="text"
          value={tagInput}
          onValueChange={setTagInput}
          onKeyDown={handleAddTag}
          placeholder="Type a tag and press Enter"
          size="lg"
          classNames={{
            inputWrapper:
              "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04] data-[focus=true]:border-black/30 dark:data-[focus=true]:border-white/30",
            input: "text-black dark:text-white",
          }}
        />
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {tags.map((tag) => (
              <Chip
                key={tag}
                variant="flat"
                onClose={() => removeTag(tag)}
                classNames={{
                  base: "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10",
                  content: "text-neutral-700 dark:text-neutral-300",
                  closeButton:
                    "text-neutral-500 hover:text-black dark:hover:text-white",
                }}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center pt-6">
        <Button
          type="submit"
          size="lg"
          className="px-12 bg-black dark:bg-white text-white dark:text-black font-medium"
        >
          Save Memory
        </Button>
      </div>
    </form>
  );
}
