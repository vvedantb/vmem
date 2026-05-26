import { Label } from "@vmem/ui";
import { useCallback, useRef } from "react";

interface ConfidenceThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function ConfidenceThresholdSlider({
  value,
  onChange,
}: ConfidenceThresholdSliderProps) {
  const pendingValue = useRef<number | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    pendingValue.current = Number(e.target.value);
  }, []);

  const handleCommit = useCallback(() => {
    if (pendingValue.current !== null) {
      onChange(pendingValue.current);
      pendingValue.current = null;
    }
  }, [onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="confidence-threshold" className="text-sm font-medium">
          Confidence threshold
        </Label>
        <span className="text-sm tabular-nums text-muted">{value}%</span>
      </div>
      <input
        id="confidence-threshold"
        type="range"
        min={0}
        max={100}
        step={5}
        defaultValue={value}
        onChange={handleChange}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-secondary accent-accent"
      />
      <p className="text-xs text-muted">
        Only extract memories with confidence above this threshold.
      </p>
    </div>
  );
}
