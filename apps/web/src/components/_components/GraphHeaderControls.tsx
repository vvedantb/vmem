"use client";

/**
 * Graph-view controls rendered in the page header.
 *
 * Renders four popover buttons — Search, Filters, Options, Legend — plus the
 * Add Memory trigger. Keeps the graph canvas visually clean; all chrome lives
 * here. State flows in through a single `controller` prop (see
 * `useMemoryGraphController`).
 */

import { useCallback, useMemo } from "react";
import {
  IconFilter,
  IconAdjustmentsHorizontal,
  IconInfoCircle,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Separator,
} from "@vmem/ui";
import AddMemoryModal from "@/components/AddMemoryModal";
import SearchPopover from "./SearchPopover";
import UnifiedFilterPanel from "./UnifiedFilterPanel";
import GraphLegend from "./GraphLegend";
import type { MemoryGraphController } from "@/hooks/useMemoryGraphController";
import type { GraphNodeKind } from "./canvas/types";
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
      <FiltersPopover controller={controller} />
      <OptionsPopover
        viewMode={controller.viewMode}
        onViewModeChange={controller.onViewModeChange}
        settings={controller.graphSettings}
        onSettingsChange={controller.onSettingsChange}
        onReset={controller.onResetSettings}
      />
      <LegendPopover
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

function FiltersPopover({ controller }: { controller: MemoryGraphController }) {
  const {
    profileId,
    onProfileChange,
    allKinds,
    activeKinds,
    onToggleKind,
    allTags,
    activeTags,
    onToggleTag,
    allSources,
    activeSources,
    onToggleSource,
    allTypes,
    activeTypes,
    onToggleType,
    totalNodeCount,
    visibleNodeCount,
    isDark,
  } = controller;

  // Kind filter narrows when any of the four kinds is unchecked. activeKinds
  // always resolves to all four when the URL is empty, so the delta from four
  // equals the number of kinds the user has hidden.
  const TOTAL_KINDS = 4;
  const kindsNarrowing = Math.max(0, TOTAL_KINDS - activeKinds.size);
  const activeFilterCount =
    (profileId !== null ? 1 : 0) +
    activeTags.size +
    activeSources.size +
    activeTypes.size +
    kindsNarrowing;

  // ---- Set ↔ array adapters for UnifiedFilterPanel ----

  const selectedKindsArray = useMemo(
    () => Array.from(activeKinds),
    [activeKinds],
  );

  const handleKindsChange = useCallback(
    (kinds: ListItemKind[]) => {
      const newSet = new Set<GraphNodeKind>(kinds);
      for (const kind of kinds) {
        if (!activeKinds.has(kind)) onToggleKind(kind);
      }
      for (const kind of activeKinds) {
        if (!newSet.has(kind)) onToggleKind(kind);
      }
    },
    [activeKinds, onToggleKind],
  );

  const selectedTagsArray = useMemo(() => Array.from(activeTags), [activeTags]);
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      const newSet = new Set(tags);
      for (const tag of tags) {
        if (!activeTags.has(tag)) onToggleTag(tag);
      }
      for (const tag of activeTags) {
        if (!newSet.has(tag)) onToggleTag(tag);
      }
    },
    [activeTags, onToggleTag],
  );

  const selectedSourcesArray = useMemo(
    () => Array.from(activeSources),
    [activeSources],
  );
  const handleSourcesChange = useCallback(
    (sources: string[]) => {
      const newSet = new Set(sources);
      for (const s of sources) {
        if (!activeSources.has(s)) onToggleSource(s);
      }
      for (const s of activeSources) {
        if (!newSet.has(s)) onToggleSource(s);
      }
    },
    [activeSources, onToggleSource],
  );

  const selectedTypesArray = useMemo(
    () => Array.from(activeTypes),
    [activeTypes],
  );
  const handleTypesChange = useCallback(
    (types: MemoryType[]) => {
      const newSet = new Set(types);
      for (const t of types) {
        if (!activeTypes.has(t)) onToggleType(t);
      }
      for (const t of activeTypes) {
        if (!newSet.has(t)) onToggleType(t);
      }
    },
    [activeTypes, onToggleType],
  );

  // Derive count records UnifiedFilterPanel expects.
  const kindCounts = useMemo<Record<ListItemKind, number>>(() => {
    const counts: Record<ListItemKind, number> = {
      memory: 0,
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
    () => allSources.map((s) => s.source),
    [allSources],
  );

  const tagStats = useMemo(
    () =>
      allTags.map((t) => ({
        tag: t.tag,
        count: t.count,
        latestCreatedAt: "", // graph doesn't track this
      })),
    [allTags],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Filter graph"
          className="relative"
        >
          <IconFilter size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-1rem)] max-w-[420px] p-0 sm:w-[420px]"
      >
        <UnifiedFilterPanel
          selectedProfileId={profileId}
          onProfileChange={onProfileChange}
          selectedKinds={selectedKindsArray}
          onKindsChange={handleKindsChange}
          kindCounts={kindCounts}
          selectedTags={selectedTagsArray}
          onTagsChange={handleTagsChange}
          tagStats={tagStats}
          distinctSources={distinctSources}
          selectedSources={selectedSourcesArray}
          onSourcesChange={handleSourcesChange}
          selectedTypes={selectedTypesArray}
          onTypesChange={handleTypesChange}
          typeCounts={typeCounts}
          filteredCount={visibleNodeCount}
          totalCount={totalNodeCount}
          isDark={isDark}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---- Options popover ----

function OptionsPopover({
  viewMode,
  onViewModeChange,
  settings,
  onSettingsChange,
  onReset,
}: {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  settings: GraphSettings;
  onSettingsChange: (s: GraphSettings) => void;
  onReset: () => void;
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
      <PopoverContent align="end" className="w-72 p-3 space-y-4">
        {/* View mode */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">View</span>
          <div className="flex items-center gap-0.5 rounded-lg bg-background/50 border border-border/30 p-0.5 w-fit">
            {VIEW_MODES.map(({ mode, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                title={VIEW_MODE_LABELS[mode]}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                  mode === viewMode
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>

        {/* Labels toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Labels</span>
          <Switch
            checked={settings.showLabels}
            onCheckedChange={handleLabelsToggle}
          />
        </div>

        <Separator />

        {/* Sliders */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Forces</span>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconRefresh size={10} />
              Reset
            </button>
          </div>
          {SLIDERS.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[11px] text-muted-foreground">
                  {field.label}
                </label>
                <span className="text-[10px] tabular-nums text-foreground/70">
                  {field.format(settings[field.key])}
                </span>
              </div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={settings[field.key]}
                onChange={(e) =>
                  handleSliderChange(field.key, parseFloat(e.target.value))
                }
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-foreground"
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- Legend popover ----

function LegendPopover({
  totalNodeCount,
  visibleNodeCount,
  edgeCount,
}: {
  totalNodeCount: number;
  visibleNodeCount: number;
  edgeCount: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Graph legend">
          <IconInfoCircle size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3">
        <GraphLegend
          nodeCount={totalNodeCount}
          edgeCount={edgeCount}
          visibleNodeCount={visibleNodeCount}
        />
      </PopoverContent>
    </Popover>
  );
}
