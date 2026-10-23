// Keyboard steps that match a native Chrome <input type="range">. Radix
// Slider moves 10 steps on Shift+Arrow and PageUp/PageDown; native moves one
// step on Shift+Arrow and 10% of the range on PageUp/PageDown. Plain arrows and
// Home/End already match, so Radix keeps those.

interface NativeRange {
  min: number;
  max: number;
  step: number;
}

interface RangeKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

const DIRECTION: Readonly<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
};

function snapToStep(value: number, { min, max, step }: NativeRange): number {
  const lastStep = min + Math.floor((max - min) / step) * step;
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(lastStep, Math.max(min, snapped));
}

// next value for the keys native and Radix disagree on, else null (Radix handles it)
export function nativeRangeKeyValue(
  key: string,
  shiftKey: boolean,
  value: number,
  range: NativeRange,
): number | null {
  const direction = DIRECTION[key];
  if (direction === undefined) return null;
  const isPage = key === "PageUp" || key === "PageDown";
  if (!isPage && !shiftKey) return null;
  const pageDelta = Math.max(
    range.step,
    Math.round((range.max - range.min) / 10 / range.step) * range.step,
  );
  const delta = isPage ? pageDelta : range.step;
  return snapToStep(value + direction * delta, range);
}

// Slider onKeyDown: preventDefault makes Radix skip its own step handler
export function handleNativeRangeKeyDown(
  event: RangeKeyEvent,
  value: number,
  range: NativeRange,
  onChange: (next: number) => void,
): void {
  const next = nativeRangeKeyValue(event.key, event.shiftKey, value, range);
  if (next === null) return;
  event.preventDefault();
  if (next !== value) onChange(next);
}
