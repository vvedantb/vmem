"use client";

import { useState } from "react";
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
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title for your memory"
          className="w-full px-6 py-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-black/30 dark:focus:border-white/30 focus:bg-black/[0.04] dark:focus:bg-white/[0.04] transition-all"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your memory content here..."
          rows={8}
          className="w-full px-6 py-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-black/30 dark:focus:border-white/30 focus:bg-black/[0.04] dark:focus:bg-white/[0.04] transition-all resize-none"
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Tags
        </label>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          placeholder="Type a tag and press Enter"
          className="w-full px-6 py-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-black/30 dark:focus:border-white/30 focus:bg-black/[0.04] dark:focus:bg-white/[0.04] transition-all"
        />
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-full bg-black/5 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border border-black/10 dark:border-white/10"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                >
                  <IconX className="w-4 h-4" stroke={2} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center pt-6">
        <button
          type="submit"
          className="px-12 py-4 rounded-xl bg-black dark:bg-white text-white dark:text-black font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
        >
          Save Memory
        </button>
      </div>
    </form>
  );
}
