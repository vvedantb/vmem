import * as React from "react";
import { IconX } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { runClearInputDissolve } from "./clearInputDissolve";

export interface ClearInputProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  wrapperClassName?: string;
  /** Icon or adornment positioned in the field's left gutter. */
  leading?: React.ReactNode;
  clearLabel?: string;
}

const ClearInput = React.forwardRef<HTMLInputElement, ClearInputProps>(
  (
    {
      value,
      onChange,
      wrapperClassName,
      leading,
      clearLabel = "Clear",
      className,
      placeholder = "",
      ...props
    },
    ref,
  ) => {
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const mirrorRef = React.useRef<HTMLDivElement>(null);
    const placeholderRef = React.useRef<HTMLDivElement>(null);
    const glowRef = React.useRef<HTMLDivElement>(null);
    const clearingRef = React.useRef(false);
    const [clearing, setClearing] = React.useState(false);

    const mergedRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const hasValue = value.length > 0 || clearing;

    React.useEffect(() => {
      const wrap = wrapRef.current;
      const mirror = mirrorRef.current;
      if (!wrap || !mirror || clearingRef.current) {
        return;
      }
      wrap.classList.toggle("has-value", value.length > 0);
      if (value.length > 0) {
        mirror.textContent = value.replace(/ /g, "\u00a0");
      } else if (!clearingRef.current) {
        mirror.textContent = "";
      }
    }, [value]);

    const preventFocusSteal = (event: React.SyntheticEvent) => {
      if (document.activeElement === inputRef.current) {
        event.preventDefault();
      }
    };

    const handleClear = () => {
      const wrap = wrapRef.current;
      const input = inputRef.current;
      const mirror = mirrorRef.current;
      const placeholderLayer = placeholderRef.current;
      const glow = glowRef.current;
      if (
        !wrap ||
        !input ||
        !mirror ||
        !placeholderLayer ||
        !glow ||
        clearingRef.current ||
        value.length === 0
      ) {
        return;
      }

      clearingRef.current = true;
      setClearing(true);

      runClearInputDissolve(
        { wrap, input, mirror, placeholderLayer, glow },
        () => {
          onChange("");
        },
        () => {
          clearingRef.current = false;
          setClearing(false);
        },
      );
    };

    const fieldClassName = cn(hasValue && "pr-9", className);

    return (
      <div
        ref={wrapRef}
        className={cn(
          "t-clear",
          hasValue && "has-value",
          clearing && "is-clearing",
          wrapperClassName,
        )}
      >
        {leading}
        <input
          ref={mergedRef}
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            "flex h-10 w-full rounded-field border border-border bg-field-background px-3.5 py-2 text-sm transition-[border-color,box-shadow,background-color] duration-200 ease-smooth placeholder:text-field-placeholder focus-visible:border-focus-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
            fieldClassName,
          )}
          {...props}
        />
        <div
          ref={mirrorRef}
          className={cn(
            "t-clear-mirror border-0 bg-transparent text-foreground shadow-none",
            fieldClassName,
          )}
          aria-hidden="true"
        />
        <div
          ref={placeholderRef}
          className={cn(
            "t-clear-placeholder border-0 bg-transparent text-field-placeholder shadow-none",
            fieldClassName,
          )}
          aria-hidden="true"
        >
          {placeholder}
        </div>
        <div ref={glowRef} className="t-clear-glow" aria-hidden="true" />
        {value.length > 0 && !clearing ? (
          <button
            type="button"
            className="t-clear-btn absolute right-2 top-1/2 z-[4] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-[background-color,color] hover:bg-surface-tertiary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={clearLabel}
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={handleClear}
          >
            <IconX size={14} stroke={1.75} />
          </button>
        ) : null}
      </div>
    );
  },
);
ClearInput.displayName = "ClearInput";

export { ClearInput };
