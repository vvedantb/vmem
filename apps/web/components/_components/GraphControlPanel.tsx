"use client";

import { useCallback } from "react";
import {
  IconMenu2,
  IconX,
  IconSearch,
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
  Switch,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Separator,
} from "@vmem/ui";
import { AnimatePresence, motion } from "motion/react";
import type { GraphSettings } from "./graph-types";
import { DEFAULT_GRAPH_SETTINGS } from "./graph-types";
import type { ViewMode } from "./graph-view-themes";
import { VIEW_MODE_LABELS } from "./graph-view-themes";
import type { TagStat } from "./graph-data";
import GraphTagFilter from "./GraphTagFilter";
import GraphLegend from "./GraphLegend";

// ---- View mode icons mapping ----

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

interface GraphControlPanelProps {
  open: boolean;
  onToggle: () => void;

  // Search
  search: string;
  onSearchChange: (value: string) => void;

  // Tags
  allTags: TagStat[];
  activeTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onSelectAllTags: () => void;
  onClearAllTags: () => void;

  // Display
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;

  // Legend
  totalNodeCount: number;
  visibleNodeCount: number;
  edgeCount: number;

  isDark: boolean;
}

export default function GraphControlPanel({
  open,
  onToggle,
  search,
  onSearchChange,
  allTags,
  activeTags,
  onToggleTag,
  onSelectAllTags,
  onClearAllTags,
  viewMode,
  onViewModeChange,
  settings,
  onSettingsChange,
  totalNodeCount,
  visibleNodeCount,
  edgeCount,
  isDark,
}: GraphControlPanelProps) {
  const handleSliderChange = useCallback(
    (key: "scalingRatio" | "gravity", value: number) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  const handleReset = useCallback(() => {
    onSettingsChange(DEFAULT_GRAPH_SETTINGS);
  }, [onSettingsChange]);

  const handleLabelsToggle = useCallback(
    (checked: boolean) => {
      onSettingsChange({ ...settings, showLabels: checked });
    },
    [settings, onSettingsChange],
  );

  return (
    <>
      {/* Toggle button — always visible */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute top-3 left-3 z-20 w-8 h-8 flex items-center justify-center rounded-md bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconMenu2 size={16} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.aside
            key="control-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute top-0 left-0 bottom-0 w-72 z-20 glass-panel-strong overflow-y-auto hidden md:flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 pb-2">
              <span className="text-sm font-medium text-foreground">
                Graph Controls
              </span>
              <button
                type="button"
                onClick={onToggle}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search nodes..."
                  className="h-8 pl-8 text-xs bg-background/50"
                />
              </div>
            </div>

            <Separator />

            {/* Tags */}
            {allTags.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Tags ({allTags.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-2">
                  <GraphTagFilter
                    tags={allTags}
                    activeTags={activeTags}
                    onToggle={onToggleTag}
                    onSelectAll={onSelectAllTags}
                    onClearAll={onClearAllTags}
                    isDark={isDark}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            <Separator />

            {/* Display */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                Display
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 space-y-3">
                {/* View mode */}
                <div>
                  <span className="text-[11px] text-muted-foreground mb-1.5 block">
                    View
                  </span>
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
                  <span className="text-[11px] text-muted-foreground">
                    Labels
                  </span>
                  <Switch
                    checked={settings.showLabels}
                    onCheckedChange={handleLabelsToggle}
                  />
                </div>

                {/* Sliders */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      Forces
                    </span>
                    <button
                      type="button"
                      onClick={handleReset}
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
                          handleSliderChange(
                            field.key,
                            parseFloat(e.target.value),
                          )
                        }
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-foreground"
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Legend */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                Legend
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <GraphLegend
                  nodeCount={totalNodeCount}
                  edgeCount={edgeCount}
                  visibleNodeCount={visibleNodeCount}
                />
              </CollapsibleContent>
            </Collapsible>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
