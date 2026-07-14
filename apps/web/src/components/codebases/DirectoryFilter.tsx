"use client";

// directory filter for the codebase graph

import { useState } from "react";
import { Checkbox, Button } from "@vmem/ui";
import { tagToColor } from "@/components/_components/graph-colors";
import type { DirectoryStat } from "./codebase-graph-data";

interface DirectoryFilterProps {
  directories: DirectoryStat[];
  activeDirectories: Set<string>;
  onToggle: (dir: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  isDark: boolean;
}

const COLLAPSED_LIMIT = 15;

export function DirectoryFilter({
  directories,
  activeDirectories,
  onToggle,
  onSelectAll,
  onClearAll,
  isDark,
}: DirectoryFilterProps) {
  const [expanded, setExpanded] = useState(false);

  if (directories.length === 0) return null;

  const visible = expanded
    ? directories
    : directories.slice(0, COLLAPSED_LIMIT);
  const hasMore = directories.length > COLLAPSED_LIMIT;
  // empty activeDirectories means "show all"
  const isAllSelected = activeDirectories.size === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
          Directories
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-5 px-1.5 text-[10px] text-muted"
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-5 px-1.5 text-[10px] text-muted"
          >
            None
          </Button>
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
        {visible.map((stat) => {
          const checked =
            isAllSelected || activeDirectories.has(stat.directory);
          return (
            <label
              key={stat.directory}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-surface-tertiary/50 cursor-pointer [content-visibility:auto] [contain-intrinsic-size:0_1.5rem]"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(stat.directory)}
                className="h-3.5 w-3.5"
              />
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: tagToColor(stat.directory, isDark),
                }}
              />
              <span className="text-xs text-foreground truncate flex-1 font-mono">
                {stat.directory}
              </span>
              <span className="text-[10px] tabular-nums text-muted/60">
                {stat.count}
              </span>
            </label>
          );
        })}
      </div>

      {hasMore && !expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          className="mt-1 h-auto px-1 text-[10px] text-muted hover:text-foreground"
        >
          Show {directories.length - COLLAPSED_LIMIT} more...
        </Button>
      )}
    </div>
  );
}
