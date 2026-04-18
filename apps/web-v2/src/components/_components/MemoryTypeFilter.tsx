"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import { IconCategory, IconLayersIntersect } from "@tabler/icons-react";
import {
  MEMORY_TYPES,
  formatMemoryTypeLabel,
  memoryMatchesTypeFilters,
  type Memory,
  type MemoryType,
} from "@/lib/memories";

interface MemoryTypeFilterProps {
  baseMemories: Memory[];
  selectedTypes: MemoryType[];
  onTypesChange: (types: MemoryType[]) => void;
}

/**
 * Memory type filter (profile / episodic / knowledge) for the list view.
 * Mirrors the source filter pattern but renders a fixed, un-virtualised list
 * because only three types exist and each deserves a visible count.
 */
export default function MemoryTypeFilter({
  baseMemories,
  selectedTypes,
  onTypesChange,
}: MemoryTypeFilterProps) {
  const [open, setOpen] = useState(false);

  const typeCounts = useMemo(() => {
    const counts: Record<MemoryType, number> = {
      profile: 0,
      episodic: 0,
      knowledge: 0,
    };
    for (const memory of baseMemories) {
      counts[memory.type] += 1;
    }
    return counts;
  }, [baseMemories]);

  const toggleType = (type: MemoryType) => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  const filteredCount = useMemo(() => {
    if (selectedTypes.length === 0) {
      return baseMemories.length;
    }
    return baseMemories.filter((m) =>
      memoryMatchesTypeFilters(m, selectedTypes),
    ).length;
  }, [baseMemories, selectedTypes]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3",
            selectedTypes.length > 0 && "border-primary text-primary",
          )}
        >
          <IconCategory size={18} stroke={1.5} />
          Type
          {selectedTypes.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
              {selectedTypes.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 flex flex-col">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTypesChange([])}
            className={cn(
              "justify-start gap-2 h-9 px-2 font-normal",
              selectedTypes.length === 0 &&
                "bg-accent text-accent-foreground font-medium",
            )}
          >
            <IconLayersIntersect size={16} stroke={1.5} />
            <span className="truncate">All types</span>
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
              {baseMemories.length}
            </span>
          </Button>
          <span className="text-xs text-muted-foreground px-1">Types</span>
        </div>
        <div className="flex flex-col">
          {MEMORY_TYPES.map((type) => {
            const checked = selectedTypes.includes(type);
            return (
              <label
                key={type}
                className="flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-3 last:border-0"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleType(type)}
                />
                <span className="flex min-w-0 flex-1 items-center text-xs font-normal">
                  <span className="truncate">
                    {formatMemoryTypeLabel(type)}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground/50 tabular-nums">
                    {typeCounts[type]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {selectedTypes.length === 0
            ? `Showing all ${baseMemories.length} ${baseMemories.length === 1 ? "memory" : "memories"}`
            : `Matching ${filteredCount} ${filteredCount === 1 ? "memory" : "memories"}`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
