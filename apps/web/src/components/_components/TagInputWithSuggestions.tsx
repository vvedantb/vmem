import { useState, useRef } from "react";
import { Button, Input, Badge, cn, floatingSurfaceClass } from "@vmem/ui";
import { IconX } from "@tabler/icons-react";
import { buildTagStats } from "@/lib/memories";
import { useRecentMemories } from "@/hooks/useRecentMemories";

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
  const { memories } = useRecentMemories();
  const allTags = buildTagStats(memories);
  const selectedTagSet = new Set(tags);

  const filteredSuggestions = !newTag.trim()
    ? allTags.filter((t) => !selectedTagSet.has(t.tag))
    : allTags.filter(
        (t) =>
          t.tag.includes(newTag.toLowerCase()) && !selectedTagSet.has(t.tag),
      );

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
          <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => removeTag(tag)}
              className="h-auto w-auto p-0 text-muted hover:text-foreground"
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
          className="h-8 rounded-field border-border bg-field-background text-foreground placeholder:text-field-placeholder hover:bg-field-background focus-visible:border-focus"
        />
        {showSuggestions && filteredSuggestions.length > 0 ? (
          <div
            className={cn(
              "absolute z-50 mt-1 max-h-32 w-full overflow-y-auto",
              floatingSurfaceClass,
            )}
          >
            {filteredSuggestions.slice(0, 5).map((item) => (
              <Button
                key={item.tag}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectSuggestion(item.tag)}
                className="w-full h-auto px-3 py-1.5 text-left flex items-center justify-between hover:bg-surface-tertiary transition-colors"
              >
                <span className="text-sm text-foreground">{item.tag}</span>
                <span className="text-xs text-muted tabular-nums">
                  {item.count}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
