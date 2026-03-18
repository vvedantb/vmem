"use client";

import { useCallback } from "react";
import { Button, Popover, PopoverTrigger, PopoverContent } from "@vmem/ui";
import { IconSettings, IconRefresh } from "@tabler/icons-react";
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from "./graph-types";

interface GraphSettingsPopoverProps {
  settings: GraphSettings;
  onChange: (settings: GraphSettings) => void;
}

const FIELDS: {
  key: keyof GraphSettings;
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
    format: (v) => String(v),
  },
  {
    key: "gravity",
    label: "Gravity",
    min: 0.1,
    max: 5,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: "repulsion",
    label: "Repulsion",
    min: 1000,
    max: 15000,
    step: 500,
    format: (v) => String(v),
  },
  {
    key: "damping",
    label: "Damping",
    min: 0.8,
    max: 0.99,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];

export default function GraphSettingsPopover({
  settings,
  onChange,
}: GraphSettingsPopoverProps) {
  const handleChange = useCallback(
    (key: keyof GraphSettings, value: number) => {
      onChange({ ...settings, [key]: value });
    },
    [settings, onChange],
  );

  const handleReset = useCallback(() => {
    onChange(DEFAULT_GRAPH_SETTINGS);
  }, [onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="bg-background/50 backdrop-blur-sm border border-border/30 hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
        >
          <IconSettings size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-64">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">
            Graph Settings
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <IconRefresh size={12} />
            Reset
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">
                  {field.label}
                </label>
                <span className="text-xs tabular-nums text-foreground/70">
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
                  handleChange(field.key, parseFloat(e.target.value))
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
