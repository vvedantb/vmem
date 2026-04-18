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
import { IconLayersIntersect, IconPlug } from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import {
  formatMemorySourceLabel,
  memoryMatchesSourceFilters,
  type Memory,
} from "@/lib/memories";

interface MemorySourceFilterProps {
  sources: string[];
  baseMemories: Memory[];
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
}

export default function MemorySourceFilter({
  sources,
  baseMemories,
  selectedSources,
  onSourcesChange,
}: MemorySourceFilterProps) {
  const [open, setOpen] = useState(false);

  const toggleSource = (source: string) => {
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  const filteredCount = useMemo(() => {
    if (selectedSources.length === 0) {
      return baseMemories.length;
    }
    return baseMemories.filter((m) =>
      memoryMatchesSourceFilters(m, selectedSources),
    ).length;
  }, [baseMemories, selectedSources]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3",
            selectedSources.length > 0 && "border-primary text-primary",
          )}
        >
          <IconPlug size={18} stroke={1.5} />
          Source
          {selectedSources.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
              {selectedSources.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 flex flex-col max-h-[min(420px,70vh)]">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSourcesChange([])}
            className={cn(
              "justify-start gap-2 h-9 px-2 font-normal",
              selectedSources.length === 0 &&
                "bg-accent text-accent-foreground font-medium",
            )}
          >
            <IconLayersIntersect size={16} stroke={1.5} />
            <span className="truncate">All sources</span>
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
              {baseMemories.length}
            </span>
          </Button>
          <span className="text-xs text-muted-foreground px-1">Sources</span>
        </div>
        {sources.length === 0 ? (
          <span className="px-3 py-2 text-xs text-muted-foreground">
            No sources yet
          </span>
        ) : (
          <Virtuoso
            data={sources}
            computeItemKey={(_index, item) => item}
            fixedItemHeight={36}
            itemContent={(_i, source) => {
              const checked = selectedSources.includes(source);
              return (
                <label className="flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-3 last:border-0">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSource(source)}
                  />
                  <span className="flex min-w-0 flex-1 items-center text-xs font-normal">
                    <span className="truncate">
                      {formatMemorySourceLabel(source)}
                    </span>
                  </span>
                </label>
              );
            }}
            style={{ height: 240 }}
          />
        )}
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {selectedSources.length === 0
            ? `Showing all ${baseMemories.length} ${baseMemories.length === 1 ? "memory" : "memories"}`
            : `Matching ${filteredCount} ${filteredCount === 1 ? "memory" : "memories"}`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
