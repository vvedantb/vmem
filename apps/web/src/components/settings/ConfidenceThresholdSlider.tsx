import { Label, Slider } from "@vvedantb/ui";
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  handleNativeRangeKeyDown,
} from "@vmem/shared";

const RANGE = {
  min: CONFIDENCE_THRESHOLD_MIN,
  max: CONFIDENCE_THRESHOLD_MAX,
  step: 5,
};

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
        <Label
          id="confidence-threshold-label"
          htmlFor="confidence-threshold"
          className="text-sm font-medium"
        >
          Confidence threshold
        </Label>
        <span className="text-sm tabular-nums text-muted">{value}%</span>
      </div>
      <Slider
        id="confidence-threshold"
        aria-labelledby="confidence-threshold-label"
        min={RANGE.min}
        max={RANGE.max}
        step={RANGE.step}
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next !== undefined) onChange(next);
        }}
        onKeyDown={(event) =>
          handleNativeRangeKeyDown(event, value, RANGE, onChange)
        }
        className="cursor-pointer py-1"
      />
      <p className="text-xs text-muted">
        Only extract memories with confidence above this threshold.
      </p>
    </div>
  );
}
