"use client";

/**
 * Graph-view controls rendered in the page header.
 *
 * Renders three popover buttons — Search, Filters, Options — plus the Add
 * Memory trigger. The Options popover absorbs the legend (counts, shapes,
 * edge colours, dim states, source logos) so the toolbar stays compact on
 * mobile. State flows in through a single `controller` prop (see
 * `useMemoryGraphController`).
 */

import { useCallback, useMemo } from "react";
import {
  IconAdjustmentsHorizontal,
  IconPlus,
  IconRefresh,
  IconGraph,
  IconSatellite,
  IconStars,
  IconGridDots,
  IconCircleDot,
} from "@tabler/icons-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Separator,
} from "@vmem/ui";
import AddMemoryModal from "@/components/AddMemoryModal";
import SearchPopover from "./SearchPopover";
import GraphLegend from "./GraphLegend";
import type { MemoryGraphController } from "@/hooks/useMemoryGraphController";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import type { ListItemKind } from "@/lib/list-items";
import type { MemoryType } from "@/lib/memories";
import { VIEW_MODE_LABELS, type ViewMode } from "./graph-view-themes";
import type { GraphSettings } from "./graph-types";

// ---- View-mode selector config ----

const VIEW_MODES: { mode: ViewMode; Icon: typeof IconGraph }[] = [
  { mode: "default", Icon: IconGraph },
  { mode: "satellite", Icon: IconSatellite },
  { mode: "constellation", Icon: IconStars },
  { mode: "blueprint", Icon: IconGridDots },
  { mode: "minimal", Icon: IconCircleDot },
];

// ---- Slider config ----

const SLIDERS: {
  key: "scalingRatio" | "gravity";
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}[] = [
  {
    key: "scalingRatio",
    label: "Spread",
    min: 1,
    max: 20,
    step: 1,
    format: String,
  },
  {
    key: "gravity",
    label: "Gravity",
    min: 0.05,
    max: 5,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
];

// ---- Props ----

interface GraphHeaderControlsProps {
  controller: MemoryGraphController;
}

export default function GraphHeaderControls({
  controller,
}: GraphHeaderControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <SearchPopover
        value={controller.search}
        onChange={controller.onSearchChange}
        placeholder="Search nodes..."
        label="Search nodes"
      />
      <GraphFiltersButton controller={controller} />
      <OptionsPopover
        viewMode={controller.viewMode}
        onViewModeChange={controller.onViewModeChange}
        settings={controller.graphSettings}
        onSettingsChange={controller.onSettingsChange}
        onReset={controller.onResetSettings}
        totalNodeCount={controller.totalNodeCount}
        visibleNodeCount={controller.visibleNodeCount}
        edgeCount={controller.edgeCount}
      />
      <AddMemoryModal
        trigger={
          <Button variant="outline" size="icon-sm" aria-label="Add memory">
            <IconPlus size={16} />
          </Button>
        }
      />
    </div>
  );
}

// ---- Filters popover ----

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

  const kindCounts = useMemo<Record<ListItemKind, number>>(() => {
    const counts: Record<ListItemKind, number> = {
      memory: 0,
      entity: 0,
      "wiki-document": 0,
      "wiki-folder": 0,
      skill: 0,
    };
    for (const stat of allKinds) counts[stat.kind] = stat.count;
    return counts;
  }, [allKinds]);

  const typeCounts = useMemo<Record<MemoryType, number>>(() => {
    const counts: Record<MemoryType, number> = {
      profile: 0,
      episodic: 0,
      knowledge: 0,
    };
    for (const stat of allTypes) counts[stat.type] = stat.count;
    return counts;
  }, [allTypes]);

  const distinctSources = useMemo(
    () => allSources.map((sourceStat) => sourceStat.source),
    [allSources],
  );

  const tagStats = useMemo(
    () =>
      allTags.map((tagStat) => ({
        tag: tagStat.tag,
        count: tagStat.count,
        latestCreatedAt: "",
      })),
    [allTags],
  );

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

// ---- Options popover ----

function OptionsPopover({
  viewMode,
  onViewModeChange,
  settings,
  onSettingsChange,
  onReset,
  totalNodeCount,
  visibleNodeCount,
  edgeCount,
}: {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  settings: GraphSettings;
  onSettingsChange: (s: GraphSettings) => void;
  onReset: () => void;
  totalNodeCount: number;
  visibleNodeCount: number;
  edgeCount: number;
}) {
  const handleSliderChange = useCallback(
    (key: "scalingRatio" | "gravity", value: number) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  const handleLabelsToggle = useCallback(
    (checked: boolean) => {
      onSettingsChange({ ...settings, showLabels: checked });
    },
    [settings, onSettingsChange],
  );

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
        {/* View mode */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted">View</span>
          <div className="flex items-center gap-0.5 rounded-lg bg-default p-0.5 w-fit">
            {VIEW_MODES.map(({ mode, Icon }) => (
              <Button
                key={mode}
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onViewModeChange(mode)}
                title={VIEW_MODE_LABELS[mode]}
                className={`h-7 w-7 ${
                  mode === viewMode
                    ? "bg-segment text-foreground"
                    : "text-muted hover:bg-surface-secondary/70 hover:text-foreground"
                }`}
              >
                <Icon size={14} />
              </Button>
            ))}
          </div>
        </div>

        {/* Labels toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">Labels</span>
          <Switch
            checked={settings.showLabels}
            onCheckedChange={handleLabelsToggle}
          />
        </div>

        <Separator />

        {/* Sliders */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted">Forces</span>
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              className="flex h-auto items-center gap-0.5 p-0 text-[10px] text-muted hover:text-foreground"
            >
              <IconRefresh size={10} />
              Reset
            </Button>
          </div>
          {SLIDERS.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[11px] text-muted">{field.label}</label>
                <span className="text-[10px] tabular-nums text-foreground/70">
                  {field.format(settings[field.key])}
                </span>
              </div>
              <Input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={settings[field.key]}
                onChange={(e) =>
                  handleSliderChange(field.key, parseFloat(e.target.value))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full border-0 bg-surface-secondary p-0 shadow-none accent-accent focus-visible:ring-0"
              />
            </div>
          ))}
        </div>

        <Separator />

        {/* Legend — counts, shapes, edge categories, dim states, source logos.
            Folded into Options instead of a sibling button so the toolbar stays
            compact on mobile. */}
        <GraphLegend
          nodeCount={totalNodeCount}
          edgeCount={edgeCount}
          visibleNodeCount={visibleNodeCount}
        />
      </PopoverContent>
    </Popover>
  );
}
