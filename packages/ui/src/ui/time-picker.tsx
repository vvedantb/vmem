"use client";

import * as React from "react";
import { Input } from "./input";
import { cn } from "../utils/cn";

/**
 * Lightweight 24-hour time picker built on the OpenStatus shadcn pattern
 * (https://github.com/openstatusHQ/time-picker, MIT) but slimmed to the
 * pieces vmem actually needs: HH and MM segments only, no AM/PM, no
 * seconds, no `Date` plumbing for callers.
 *
 * Each segment is a separate `<Input>` that listens for digit / arrow
 * keys, auto-advances right after two digits, and clamps the value to
 * its valid range. The composite component speaks plain "HH:MM" strings
 * so consumers don't have to juggle `Date` objects (vmem stores time as
 * UTC hour+minute, never as a full date).
 */

type Segment = "hours" | "minutes";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clampNumber(value: string, min: number, max: number, loop: boolean) {
  let n = parseInt(value, 10);
  if (Number.isNaN(n)) return pad(min);
  if (loop) {
    if (n > max) n = min;
    if (n < min) n = max;
  } else {
    if (n > max) n = max;
    if (n < min) n = min;
  }
  return pad(n);
}

function isValidHour(value: string) {
  return /^(0[0-9]|1[0-9]|2[0-3])$/.test(value);
}

function isValidMinute(value: string) {
  return /^[0-5][0-9]$/.test(value);
}

function getSegmentMax(segment: Segment) {
  return segment === "hours" ? 23 : 59;
}

function isSegmentValid(segment: Segment, value: string) {
  return segment === "hours" ? isValidHour(value) : isValidMinute(value);
}

function clampSegment(segment: Segment, value: string) {
  if (isSegmentValid(segment, value)) return value;
  return clampNumber(value, 0, getSegmentMax(segment), false);
}

function arrowSegment(segment: Segment, value: string, step: number) {
  const next = String((parseInt(value, 10) || 0) + step);
  return clampNumber(next, 0, getSegmentMax(segment), true);
}

interface TimePickerSegmentInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value"
> {
  segment: Segment;
  value: string;
  onValueChange: (next: string) => void;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

const TimePickerSegmentInput = React.forwardRef<
  HTMLInputElement,
  TimePickerSegmentInputProps
>(
  (
    {
      className,
      type = "tel",
      segment,
      value,
      onValueChange,
      onKeyDown,
      onRightFocus,
      onLeftFocus,
      ...props
    },
    ref,
  ) => {
    const [flag, setFlag] = React.useState(false);

    /**
     * After typing the first digit we wait up to 2s for the second; if
     * nothing comes the next keystroke restarts from "0X" rather than
     * appending forever.
     */
    React.useEffect(() => {
      if (!flag) return;
      const timer = window.setTimeout(() => setFlag(false), 2000);
      return () => window.clearTimeout(timer);
    }, [flag]);

    const calculateNewValue = (key: string) =>
      !flag ? "0" + key : value.slice(1, 2) + key;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return;
      e.preventDefault();
      if (e.key === "ArrowRight") onRightFocus?.();
      if (e.key === "ArrowLeft") onLeftFocus?.();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.key === "ArrowUp" ? 1 : -1;
        if (flag) setFlag(false);
        onValueChange(arrowSegment(segment, value, step));
      }
      if (e.key >= "0" && e.key <= "9") {
        const raw = calculateNewValue(e.key);
        if (flag) onRightFocus?.();
        setFlag((prev) => !prev);
        onValueChange(clampSegment(segment, raw));
      }
    };

    return (
      <Input
        ref={ref}
        type={type}
        inputMode="decimal"
        value={value}
        onChange={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          handleKeyDown(e);
        }}
        className={cn(
          "w-12 text-center font-mono text-base tabular-nums caret-transparent focus:bg-accent focus:text-accent-foreground [&::-webkit-inner-spin-button]:appearance-none",
          className,
        )}
        {...props}
      />
    );
  },
);
TimePickerSegmentInput.displayName = "TimePickerSegmentInput";

export interface TimePickerProps {
  /**
   * Time as a "HH:MM" string in 24-hour format. Empty string is treated
   * as 00:00 — callers should provide a real value when they have one.
   */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

function parseHHMM(value: string): { hours: string; minutes: string } {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);
  if (!match) return { hours: "00", minutes: "00" };
  return {
    hours: clampSegment("hours", match[1].padStart(2, "0")),
    minutes: clampSegment("minutes", match[2].padStart(2, "0")),
  };
}

const TimePicker = React.forwardRef<HTMLDivElement, TimePickerProps>(
  ({ value, onChange, className, ariaLabel, disabled }, ref) => {
    const { hours, minutes } = parseHHMM(value);
    const hourRef = React.useRef<HTMLInputElement>(null);
    const minuteRef = React.useRef<HTMLInputElement>(null);

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        className={cn("inline-flex items-center gap-1", className)}
      >
        <TimePickerSegmentInput
          ref={hourRef}
          segment="hours"
          value={hours}
          disabled={disabled}
          aria-label="Hours"
          onValueChange={(next) => onChange(`${next}:${minutes}`)}
          onRightFocus={() => minuteRef.current?.focus()}
        />
        <span className="text-muted-foreground">:</span>
        <TimePickerSegmentInput
          ref={minuteRef}
          segment="minutes"
          value={minutes}
          disabled={disabled}
          aria-label="Minutes"
          onValueChange={(next) => onChange(`${hours}:${next}`)}
          onLeftFocus={() => hourRef.current?.focus()}
        />
      </div>
    );
  },
);
TimePicker.displayName = "TimePicker";

export { TimePicker };
