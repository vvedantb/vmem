"use client";

import { Button, Checkbox, cn, TabsPrimitive } from "@vmem/ui";
import { Virtuoso } from "react-virtuoso";
import { formatMemorySourceLabel } from "@/lib/memories";
import { isCheckedByDefault, toggleCheckedByDefault } from "./checkedByDefault";

interface SourceVirtuosoContext {
  selectedSources: string[];
  distinctSources: string[];
  toggleSource: (source: string) => void;
}

function SourceVirtuosoRow({
  source,
  context,
}: {
  source: string;
  context?: SourceVirtuosoContext;
}) {
  const checked = isCheckedByDefault(context?.selectedSources ?? [], source);
  return (
    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-separator last:border-0 hover:bg-surface-tertiary">
      <Checkbox
        checked={checked}
        onCheckedChange={() => context?.toggleSource(source)}
      />
      <span className="flex-1 text-xs truncate">
        {formatMemorySourceLabel(source)}
      </span>
    </label>
  );
}

function renderSourceVirtuosoRow(
  _index: number,
  source: string,
  context?: SourceVirtuosoContext,
) {
  return <SourceVirtuosoRow source={source} context={context} />;
}

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
    onSourcesChange?.(
      toggleCheckedByDefault(selectedSources, source, distinctSources),
    );
  };

  return (
    <TabsPrimitive.Content
      value="source"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-separator">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSourcesChange?.([])}
          className={cn(
            "h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors active:scale-100",
            selectedSources.length === 0
              ? "bg-surface-secondary font-medium text-foreground hover:bg-surface-secondary"
              : "hover:bg-surface-tertiary",
          )}
        >
          All sources
          <span className="ml-auto text-muted/50 tabular-nums">
            {totalCount}
          </span>
        </Button>
      </div>
      {distinctSources.length === 0 ? (
        <div className="p-3 text-xs text-muted text-center">No sources yet</div>
      ) : (
        <div className="flex-1 min-h-0">
          <Virtuoso
            data={distinctSources}
            context={{ selectedSources, distinctSources, toggleSource }}
            computeItemKey={(_index, item) => item}
            fixedItemHeight={36}
            itemContent={renderSourceVirtuosoRow}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </TabsPrimitive.Content>
  );
}
