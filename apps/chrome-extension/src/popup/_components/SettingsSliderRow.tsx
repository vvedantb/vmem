import type { ReactNode } from "react";
import { Label } from "@vmem/ui";

interface SettingsSliderRowProps {
  id: string;
  label: string;
  description?: string;
  /** Current value in minutes. Snapped to the nearest preset for display. */
  value: number;
  /** Selectable values (minutes), ascending. */
  presets: readonly number[];
  /** Human label for the current value, e.g. "Every 30 minutes". */
  format: (minutes: number) => string;
  /** Compact label for the axis ends, e.g. "15m" / "24h". */
  formatShort: (minutes: number) => string;
  onValueChange: (minutes: number) => void;
  disabled?: boolean;
  icon?: ReactNode;
}

/** Safe indexed read — keeps the slider total under noUncheckedIndexedAccess. */
function valueAt(presets: readonly number[], index: number): number {
  const value = presets[index];
  return value === undefined ? 0 : value;
}

/** Index of the preset closest to `minutes` (handles legacy/off-grid values). */
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

/**
 * Stacked label + snap-to-preset range slider. Uses a native range input —
 * the popup is Chromium-only and globals.css themes range inputs via
 * `accent-color`, so no custom track/thumb styling is needed. The slider
 * operates in preset-index space (evenly spaced stops) while reading/writing
 * minutes, so the non-linear 15m–24h scale snaps to even, easy-to-hit steps.
 */
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
