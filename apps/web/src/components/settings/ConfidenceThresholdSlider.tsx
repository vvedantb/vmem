import { Input, Label } from "@vmem/ui";

interface ConfidenceThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function ConfidenceThresholdSlider({
  value,
  onChange,
}: ConfidenceThresholdSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="confidence-threshold" className="text-sm font-medium">
          Confidence threshold
        </Label>
        <span className="text-sm tabular-nums text-muted">{value}%</span>
      </div>
      <Input
        id="confidence-threshold"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full border-0 bg-surface-secondary p-0 accent-accent focus-visible:ring-0"
      />
      <p className="text-xs text-muted">
        Only extract memories with confidence above this threshold.
      </p>
    </div>
  );
}
