import type { ReactNode } from "react";
import { Label } from "@vmem/ui";

interface SettingsSliderRowProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  presets: readonly number[];
  format: (minutes: number) => string;
  formatShort: (minutes: number) => string;
  onValueChange: (minutes: number) => void;
  disabled?: boolean;
  icon?: ReactNode;
}

function valueAt(presets: readonly number[], index: number): number {
  const value = presets[index];
  return value === undefined ? 0 : value;
}

// snap legacy off-grid values to the nearest preset
function nearestIndex(presets: readonly number[], minutes: number): number {
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < presets.length; i++) {
    const diff = Math.abs(valueAt(presets, i) - minutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export function SettingsSliderRow({
  id,
  label,
  description,
  value,
  presets,
  format,
  formatShort,
  onValueChange,
  disabled,
  icon,
}: SettingsSliderRowProps) {
  const maxIndex = Math.max(0, presets.length - 1);
  const index = nearestIndex(presets, value);
  const snapped = valueAt(presets, index);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? (
            <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
          ) : null}
          <div className="min-w-0">
            <Label htmlFor={id} className="text-sm font-medium">
              {label}
            </Label>
            {description ? (
              <p className="mt-1 text-xs text-muted text-pretty">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
          {format(snapped)}
        </span>
      </div>
      <div className="space-y-1">
        <input
          id={id}
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={index}
          disabled={disabled}
          onChange={(event) =>
            onValueChange(valueAt(presets, Number(event.target.value)))
          }
          className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex justify-between text-[11px] text-muted tabular-nums">
          <span>{formatShort(valueAt(presets, 0))}</span>
          <span>{formatShort(valueAt(presets, maxIndex))}</span>
        </div>
      </div>
    </div>
  );
}
