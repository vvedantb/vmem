"use client";

import { useMemo } from "react";

interface TagStats {
  tag: string;
  count: number;
}

interface TagCloudProps {
  tags: TagStats[];
  onTagClick?: (tag: string) => void;
  maxTags?: number;
}

export default function TagCloud({
  tags,
  onTagClick,
  maxTags = 50,
}: TagCloudProps) {
  // Calculate font sizes based on count
  const { tagsWithSize, maxCount, minCount } = useMemo(() => {
    const sortedTags = [...tags].slice(0, maxTags);
    const counts = sortedTags.map((t) => t.count);
    const max = Math.max(...counts, 1);
    const min = Math.min(...counts, 1);

    // Shuffle for random layout appearance
    const shuffled = [...sortedTags].sort(() => Math.random() - 0.5);

    return {
      tagsWithSize: shuffled.map((t) => ({
        ...t,
        // Calculate size factor (0-1 range)
        sizeFactor:
          max === min ? 0.5 : (t.count - min) / (max - min),
      })),
      maxCount: max,
      minCount: min,
    };
  }, [tags, maxTags]);

  // Map size factor to tailwind classes
  const getSizeClass = (sizeFactor: number) => {
    if (sizeFactor > 0.8) return "text-3xl font-bold";
    if (sizeFactor > 0.6) return "text-2xl font-semibold";
    if (sizeFactor > 0.4) return "text-xl font-medium";
    if (sizeFactor > 0.2) return "text-base";
    return "text-sm";
  };

  // Map size factor to opacity
  const getOpacity = (sizeFactor: number) => {
    return Math.max(0.5, 0.5 + sizeFactor * 0.5);
  };

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No tags yet. Add tags to your memories to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {tagsWithSize.map((item) => (
          <button
            key={item.tag}
            onClick={() => onTagClick?.(item.tag)}
            className={`${getSizeClass(item.sizeFactor)} text-neutral-800 dark:text-neutral-200 hover:text-black dark:hover:text-white transition-colors cursor-pointer`}
            style={{ opacity: getOpacity(item.sizeFactor) }}
            title={`${item.tag}: ${item.count} ${item.count === 1 ? "memory" : "memories"}`}
          >
            {item.tag}
          </button>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs text-neutral-500">
        <span>
          {tags.length} {tags.length === 1 ? "tag" : "tags"} total
        </span>
        <span>
          Size indicates usage frequency ({minCount}-{maxCount} memories)
        </span>
      </div>
    </div>
  );
}
