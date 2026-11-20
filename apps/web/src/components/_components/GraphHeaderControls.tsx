// graph header search / filters / options (+ add memory)

import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Separator,
  cn,
} from "@vvedantb/ui";
import AddMemoryIconTrigger from "@/components/memories/AddMemoryIconTrigger";
import HeaderSearchPopover from "./HeaderSearchPopover";
import GraphLegend from "./GraphLegend";
import type { MemoryGraphController } from "@/hooks/useMemoryGraphController";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import type { ListItemKind } from "@/lib/list-items";
import type { MemoryType } from "@/lib/memories";
import type { GraphSettings } from "@/lib/graph/graph-types";

interface GraphHeaderControlsProps {
  controller: MemoryGraphController;
}

export default function GraphHeaderControls({
  controller,
}: GraphHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <HeaderSearchPopover
        value={controller.search}
        onChange={controller.onSearchChange}
        placeholder="Search nodes..."
        label="Search nodes"
      >
        {controller.isSearchActive ? (
          <GraphSearchResults controller={controller} />
        ) : null}
      </HeaderSearchPopover>
      <GraphFiltersButton controller={controller} />
      <OptionsPopover
        settings={controller.graphSettings}
        onSettingsChange={controller.onSettingsChange}
      />
      <AddMemoryIconTrigger />
    </div>
  );
}

// first matches only; the count line tells the user when there are more
const MAX_SEARCH_RESULTS = 50;

function GraphSearchResults({
  controller,
}: {
  controller: MemoryGraphController;
}) {
  const { searchResults, selectedNodeId, onRevealNode } = controller;
  const shown = searchResults.slice(0, MAX_SEARCH_RESULTS);

  return (
    <>
      <p className="px-1 text-xs text-muted tabular-nums">
        {searchResults.length === 0
          ? "No matches"
          : searchResults.length > shown.length
            ? `First ${String(shown.length)} of ${searchResults.length.toLocaleString()} matches`
            : `${String(searchResults.length)} match${searchResults.length === 1 ? "" : "es"}`}
      </p>
      {shown.length > 0 ? (
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.map((node) => (
            <Button
              key={node.id}
              type="button"
              variant="ghost"
              shape="rounded"
              aria-current={node.id === selectedNodeId ? "true" : undefined}
              onClick={() => onRevealNode(node.id)}
              className={cn(
                "h-auto w-full justify-start px-2 py-1.5 text-left",
                node.id === selectedNodeId && "bg-surface-tertiary",
              )}
            >
              <span className="truncate text-sm text-foreground">
                {node.title}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function GraphFiltersButton({
  controller,
}: {
  controller: MemoryGraphController;
}) {
  const {
    filters,
    onKindsChange,
    onTagsChange,
    onSourcesChange,
    onTypesChange,
    onClearFilters,
    allKinds,
    allTags,
    allSources,
    allTypes,
    totalNodeCount,
    visibleNodeCount,
    isDark,
  } = controller;

  const kindCounts: Record<ListItemKind, number> = {
    memory: 0,
    entity: 0,
    skill: 0,
  };
  for (const stat of allKinds) kindCounts[stat.kind] = stat.count;

  const typeCounts: Record<MemoryType, number> = {
    profile: 0,
    episodic: 0,
    knowledge: 0,
  };
  for (const stat of allTypes) typeCounts[stat.type] = stat.count;

  const distinctSources = allSources.map((sourceStat) => sourceStat.source);

  const tagStats = allTags.map((tagStat) => ({
    tag: tagStat.tag,
    count: tagStat.count,
    latestCreatedAt: "",
  }));

  return (
    <MemoryFiltersButton
      filters={filters}
      onKindsChange={onKindsChange}
      onTagsChange={onTagsChange}
      onSourcesChange={onSourcesChange}
      onTypesChange={onTypesChange}
      onClearAll={onClearFilters}
      kindCounts={kindCounts}
      tagStats={tagStats}
      distinctSources={distinctSources}
      typeCounts={typeCounts}
      filteredCount={visibleNodeCount}
      totalCount={totalNodeCount}
      isDark={isDark}
      ariaLabel="Filter graph"
    />
  );
}

function OptionsPopover({
  settings,
  onSettingsChange,
}: {
  settings: GraphSettings;
  onSettingsChange: (s: GraphSettings) => void;
}) {
  const handleLabelsToggle = (checked: boolean) => {
    onSettingsChange({ ...settings, showLabels: checked });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Graph display options"
        >
          <IconAdjustmentsHorizontal size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-3 space-y-4 max-h-[80dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">Labels</span>
          <Switch
            checked={settings.showLabels}
            onCheckedChange={handleLabelsToggle}
          />
        </div>

        <Separator />

        <GraphLegend />
      </PopoverContent>
    </Popover>
  );
}
