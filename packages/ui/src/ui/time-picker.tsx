"use client";

import * as React from "react";
import { IconClock } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../utils/cn";

/**
 * Custom 24-hour "HH:MM" time picker.
 *
 * Replaces `<input type="time">` because the native picker varies wildly
 * across browsers and platforms (Chrome/Firefox/Safari each render a
 * different control, and the spinner buttons feel laggy on Windows).
 *
 * UX:
 * - The trigger is styled like an Input — same height/border/radius — so
 *   it slots into forms without bespoke alignment work.
 * - Clicking the trigger (or its clock icon) opens a popover with two
 *   scrollable columns: hours 00–23 on the left, minutes 00–59 on the
 *   right. Click an item to select; the popover stays open so users can
 *   set both halves in one trip.
 * - Selected items use the same `bg-surface-tertiary` treatment used elsewhere for
 *   active states, no rings or borders, matching the design system.
 *
 * The component is fully controlled — `value` is always "HH:MM" 24h and
 * the consumer is responsible for any local↔UTC conversion. That keeps
 * the picker free of timezone logic and matches how the rest of the
 * codebase (e.g. Dream Mode) shapes scheduling values.
 */
interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Width of the trigger button. Defaults to a compact 110px. */
  triggerClassName?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

function parseValue(value: string): { hour: string; minute: string } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match) return { hour: match[1], minute: match[2] };
  return { hour: "00", minute: "00" };
}

/**
 * Auto-scroll a column to its selected item when the popover opens. Using
 * `scrollIntoView({ block: "center" })` is good enough — the popover only
 * has 2 columns and a fixed height, so we don't need a custom scroll calc.
 */
function useScrollSelectedIntoView(
  ref: React.RefObject<HTMLDivElement | null>,
  selector: string,
  open: boolean,
): void {
  React.useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const target = root.querySelector(selector);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [open, ref, selector]);
}

const TimePicker = React.forwardRef<HTMLButtonElement, TimePickerProps>(
  (
    { value, onChange, className, disabled, ariaLabel, triggerClassName },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const { hour, minute } = parseValue(value);
    const hoursRef = React.useRef<HTMLDivElement | null>(null);
    const minutesRef = React.useRef<HTMLDivElement | null>(null);

    useScrollSelectedIntoView(hoursRef, `[data-time-value="${hour}"]`, open);
    useScrollSelectedIntoView(
      minutesRef,
      `[data-time-value="${minute}"]`,
      open,
    );

    const handleHourSelect = (h: string) => {
      onChange(`${h}:${minute}`);
    };
    const handleMinuteSelect = (m: string) => {
      onChange(`${hour}:${m}`);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              "inline-flex h-8 items-center justify-between gap-2 rounded-field border border-border bg-field-background px-2.5 text-xs font-medium tabular-nums transition-[border-color,box-shadow,background-color] duration-200 ease-smooth hover:bg-field-background/90 focus-visible:border-focus/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName ?? "w-[110px]",
              className,
            )}
          >
            <span>{`${hour}:${minute}`}</span>
            <IconClock className="h-3.5 w-3.5 text-muted" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="flex w-auto gap-1 p-2"
        >
          <TimeColumn
            ref={hoursRef}
            label="Hours"
            values={HOURS}
            selected={hour}
            onSelect={handleHourSelect}
          />
          <TimeColumn
            ref={minutesRef}
            label="Minutes"
            values={MINUTES}
            selected={minute}
            onSelect={handleMinuteSelect}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
TimePicker.displayName = "TimePicker";

interface TimeColumnProps {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}

const TimeColumn = React.forwardRef<HTMLDivElement, TimeColumnProps>(
  ({ label, values, selected, onSelect }, ref) => {
    return (
      <div className="flex w-14 flex-col">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted">
          {label}
        </div>
        <div
          ref={ref}
          className="h-48 overflow-y-auto rounded-lg bg-surface-secondary/40 py-1"
        >
          {values.map((v) => {
            const isSelected = v === selected;
            return (
              <button
                key={v}
                type="button"
                data-time-value={v}
                onClick={() => onSelect(v)}
                className={cn(
                  "flex h-7 w-full items-center justify-center text-xs tabular-nums transition-colors",
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/80 hover:bg-surface-tertiary/50",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
TimeColumn.displayName = "TimeColumn";

export { TimePicker };
