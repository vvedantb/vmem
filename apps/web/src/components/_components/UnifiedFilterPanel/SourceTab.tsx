import { formatMemorySourceLabel } from "@/lib/memories";
import {
  FilterCheckboxRow,
  VirtuosoFilterTab,
  isCheckedByDefault,
  toggleCheckedByDefault,
} from "@/components/_components/FacetedFilter";

interface SourceCtx {
  selectedSources: string[];
  distinctSources: string[];
  onSourcesChange?: (sources: string[]) => void;
}

function renderSourceRow(_i: number, source: string, ctx: SourceCtx) {
  return (
    <FilterCheckboxRow
      checked={isCheckedByDefault(ctx.selectedSources, source)}
      onToggle={() => {
        if (ctx.onSourcesChange == null) return;
        ctx.onSourcesChange(
          toggleCheckedByDefault(
            ctx.selectedSources,
            source,
            ctx.distinctSources,
          ),
        );
      }}
      label={formatMemorySourceLabel(source)}
    />
  );
}

export default function SourceTab({
  distinctSources,
  selectedSources,
  onSourcesChange,
  totalCount,
}: {
  distinctSources: string[];
  selectedSources: string[];
  onSourcesChange?: (sources: string[]) => void;
  totalCount: number;
}) {
  return (
    <VirtuosoFilterTab
      value="source"
      allLabel="All sources"
      totalCount={totalCount}
      isAllSelected={selectedSources.length === 0}
      onSelectAll={() => onSourcesChange?.([])}
      items={distinctSources}
      emptyMessage="No sources yet"
      context={{ selectedSources, distinctSources, onSourcesChange }}
      computeItemKey={(_i, item) => item}
      itemContent={renderSourceRow}
    />
  );
}
