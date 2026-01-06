"use client";

import { useState } from "react";
import { Input, Textarea, Button, Chip, addToast } from "@heroui/react";
import { IconLoader2 } from "@tabler/icons-react";

export default function AddMemoryForm() {
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
    setTags([]);
    setTagInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!title.trim()) {
      addToast({
        title: "Validation Error",
        description: "Please enter a title for your memory",
        color: "danger",
      });
      return;
    }

    if (!content.trim()) {
      addToast({
        title: "Validation Error",
        description: "Please enter content for your memory",
        color: "danger",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/memories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          tags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save memory");
      }

      addToast({
        title: "Memory Saved",
        description: "Your memory has been saved successfully",
        color: "success",
      });

      resetForm();
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save memory",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
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
          isDisabled={isSubmitting}
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
          isDisabled={isSubmitting}
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
          isDisabled={isSubmitting}
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
          isDisabled={isSubmitting}
          className="px-12 bg-black dark:bg-white text-white dark:text-black font-medium"
        >
          {isSubmitting ? (
            <>
              <IconLoader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            "Save Memory"
          )}
        </Button>
      </div>
    </form>
  );
}
