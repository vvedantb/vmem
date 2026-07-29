// graph header search / filters / options (+ add memory)

import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Separator,
} from "@vmem/ui";
import AddMemoryIconTrigger from "@/components/memories/AddMemoryIconTrigger";
import HeaderSearchInput from "./HeaderSearchInput";
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
      <HeaderSearchInput
        value={controller.search}
        onChange={controller.onSearchChange}
        placeholder="Search nodes..."
        label="Search nodes"
      />
      <GraphFiltersButton controller={controller} />
      <OptionsPopover
        settings={controller.graphSettings}
        onSettingsChange={controller.onSettingsChange}
      />
      <AddMemoryIconTrigger />
    </div>
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
    "wiki-document": 0,
    "wiki-artifact": 0,
    "wiki-folder": 0,
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
        className="w-72 p-3 space-y-4 max-h-[80vh] overflow-y-auto"
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
