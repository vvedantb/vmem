"use client";

import { useState } from "react";
import { Checkbox, Button } from "@vmem/ui";
import { tagToColor } from "./graph-colors";
import type { TagStat } from "./graph-data";

interface GraphTagFilterProps {
  tags: TagStat[];
  activeTags: Set<string>;
  onToggle: (tag: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  isDark: boolean;
}

const COLLAPSED_LIMIT = 20;

export default function GraphTagFilter({
  tags,
  activeTags,
  onToggle,
  onSelectAll,
  onClearAll,
  isDark,
}: GraphTagFilterProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleTags = expanded ? tags : tags.slice(0, COLLAPSED_LIMIT);
  const hasMore = tags.length > COLLAPSED_LIMIT;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
        >
          None
        </Button>
      </div>

      <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
        {visibleTags.map((stat) => {
          const checked = activeTags.has(stat.tag);
          return (
            <label
              key={stat.tag}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-foreground/5 cursor-pointer"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(stat.tag)}
                className="h-3.5 w-3.5"
              />
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tagToColor(stat.tag, isDark) }}
              />
              <span className="text-xs text-foreground truncate flex-1">
                {stat.tag}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {stat.count}
              </span>
            </label>
          );
        })}
      </div>

      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] text-muted-foreground hover:text-foreground mt-1 px-1"
        >
          Show {tags.length - COLLAPSED_LIMIT} more...
        </button>
      )}
    </div>
  );
}
