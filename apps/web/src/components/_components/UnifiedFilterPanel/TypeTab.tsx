"use client";

import { Checkbox, cn, TabsPrimitive } from "@vmem/ui";
import {
  formatMemoryTypeLabel,
  MEMORY_TYPES,
  type MemoryType,
} from "@/lib/memories";

interface TypeTabProps {
  selectedTypes: MemoryType[];
  onTypesChange?: (types: MemoryType[]) => void;
  typeCounts: Record<MemoryType, number>;
  totalCount: number;
}

export default function TypeTab({
  selectedTypes,
  onTypesChange,
  typeCounts,
  totalCount,
}: TypeTabProps) {
  const toggleType = (type: MemoryType) => {
    if (!onTypesChange) return;
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  return (
    <TabsPrimitive.Content
      value="type"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-border">
        <button
          type="button"
          onClick={() => onTypesChange?.([])}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            selectedTypes.length === 0
              ? "bg-surface-tertiary text-accent-foreground font-medium"
              : "hover:bg-surface-secondary/50",
          )}
        >
          All types
          <span className="ml-auto text-muted/50 tabular-nums">
            {totalCount}
          </span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {MEMORY_TYPES.map((type) => {
          const checked = selectedTypes.includes(type);
          return (
            <label
              key={type}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-0 hover:bg-surface-secondary/30"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleType(type)}
              />
              <span className="flex-1 text-xs truncate">
                {formatMemoryTypeLabel(type)}
              </span>
              <span className="text-xs text-muted/50 tabular-nums">
                {typeCounts[type]}
              </span>
            </label>
          );
        })}
      </div>
    </TabsPrimitive.Content>
  );
}
