"use client";

import { useMemo } from "react";
import { Badge } from "@vmem/ui";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

interface TagSelectorProps {
  value: string;
  onSelect: (tag: string) => void;
}

export default function TagSelector({ value, onSelect }: TagSelectorProps) {
  const { memories } = useMemoryContext();

  const uniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const memory of memories) {
      for (const tag of memory.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [memories]);

  if (uniqueTags.length === 0) {
    return <p className="text-sm text-muted-foreground">No tags available</p>;
  }

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto">
      {uniqueTags.map((tag) => (
        <Badge
          key={tag}
          variant={value === tag ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => onSelect(tag)}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
