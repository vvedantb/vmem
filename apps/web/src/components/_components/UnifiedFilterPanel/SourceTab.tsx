"use client";

import { Checkbox, cn, TabsPrimitive } from "@vmem/ui";
import { Virtuoso } from "react-virtuoso";
import { formatMemorySourceLabel } from "@/lib/memories";

interface SourceTabProps {
  distinctSources: string[];
  selectedSources: string[];
  onSourcesChange?: (sources: string[]) => void;
  totalCount: number;
}

export default function SourceTab({
  distinctSources,
  selectedSources,
  onSourcesChange,
  totalCount,
}: SourceTabProps) {
  const toggleSource = (source: string) => {
    if (!onSourcesChange) return;
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  return (
    <TabsPrimitive.Content
      value="source"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-separator">
        <button
          type="button"
          onClick={() => onSourcesChange?.([])}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
            selectedSources.length === 0
              ? "bg-surface text-foreground font-medium"
              : "hover:bg-surface-tertiary/50",
          )}
        >
          All sources
          <span className="ml-auto text-muted/50 tabular-nums">
            {totalCount}
          </span>
        </button>
      </div>
      {distinctSources.length === 0 ? (
        <div className="p-3 text-xs text-muted text-center">No sources yet</div>
      ) : (
        <div className="flex-1 min-h-0">
          <Virtuoso
            data={distinctSources}
            computeItemKey={(_index, item) => item}
            fixedItemHeight={36}
            itemContent={(_i, source) => {
              const checked = selectedSources.includes(source);
              return (
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-separator last:border-0 hover:bg-surface-tertiary/50">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSource(source)}
                  />
                  <span className="flex-1 text-xs truncate">
                    {formatMemorySourceLabel(source)}
                  </span>
                </label>
              );
            }}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </TabsPrimitive.Content>
  );
}
