"use client";

import { useState, useMemo, useRef } from "react";
import { Button, Input, Badge } from "@vmem/ui";
import { IconX } from "@tabler/icons-react";
import { buildTagStats, type Memory } from "@/lib/memories";
import { useMemoryContext } from "@/components/contexts/MemoryContext";

interface TagInputWithSuggestionsProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export default function TagInputWithSuggestions({
  tags,
  onChange,
  disabled = false,
}: TagInputWithSuggestionsProps) {
  const [newTag, setNewTag] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const { memories } = useMemoryContext();
  const allTags = useMemo(() => buildTagStats(memories), [memories]);

  const filteredSuggestions = useMemo(() => {
    if (!newTag.trim()) return allTags.filter((t) => !tags.includes(t.tag));
    const input = newTag.toLowerCase();
    return allTags.filter(
      (t) => t.tag.includes(input) && !tags.includes(t.tag),
    );
  }, [newTag, allTags, tags]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const tag = newTag.trim().toLowerCase();
      if (tag && !tags.includes(tag)) {
        onChange([...tags, tag]);
        setNewTag("");
        setShowSuggestions(false);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (tag: string) => {
    if (!tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setNewTag("");
    setShowSuggestions(false);
    tagInputRef.current?.focus();
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="bg-muted border-border text-muted-foreground text-xs gap-1 pr-1"
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
      <div className="relative">
        <Input
          ref={tagInputRef}
          value={newTag}
          onChange={(e) => {
            setNewTag(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder="Add a tag and press Enter"
          disabled={disabled}
          className="h-8 bg-muted/50 border-border text-foreground hover:bg-accent focus-visible:border-ring"
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {filteredSuggestions.slice(0, 5).map((item) => (
              <Button
                key={item.tag}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectSuggestion(item.tag)}
                className="w-full h-auto px-3 py-1.5 text-left flex items-center justify-between hover:bg-accent transition-colors"
              >
                <span className="text-sm text-foreground">{item.tag}</span>
                <span className="text-xs text-muted-foreground">
                  {item.count}
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
