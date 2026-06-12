import type { ReactNode } from "react";

interface SlideShellProps {
  children: ReactNode;
  className?: string;
  center?: boolean;
}

/** Full-stage wrapper for every slide. */
export function SlideShell({
  children,
  className = "",
  center = false,
}: SlideShellProps) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-background px-20 py-16 ${center ? "items-center justify-center" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

interface SlideKickerProps {
  children: ReactNode;
}

/** Small uppercase eyebrow label above the title. */
export function SlideKicker({ children }: SlideKickerProps) {
  return (
    <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-muted">
      {children}
    </p>
  );
}

interface SlideTitleProps {
  children: ReactNode;
  size?: "xl" | "2xl" | "3xl";
}

/** Primary slide heading. */
export function SlideTitle({ children, size = "2xl" }: SlideTitleProps) {
  const sizeClass =
    size === "xl" ? "text-5xl" : size === "2xl" ? "text-6xl" : "text-7xl";
  return (
    <h1
      className={`font-instrumentSerif ${sizeClass} font-normal leading-tight tracking-tight text-foreground`}
    >
      {children}
    </h1>
  );
}

interface SlideBodyProps {
  children: ReactNode;
  className?: string;
}

/** Secondary body text. */
export function SlideBody({ children, className = "" }: SlideBodyProps) {
  return (
    <p className={`text-lg leading-relaxed text-muted ${className}`}>
      {children}
    </p>
  );
}

interface SlideBulletsProps {
  items: string[];
}

/** Bullet list of key points. */
export function SlideBullets({ items }: SlideBulletsProps) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
          <span className="text-base leading-relaxed text-foreground/80">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SlideDividerProps {
  className?: string;
}

/** Minimal spacer / separator — uses whitespace, not a line. */
export function SlideDivider({ className = "" }: SlideDividerProps) {
  return <div className={`mt-8 ${className}`} />;
}

interface SlideTagProps {
  children: ReactNode;
}

/** Small pill tag for labelling concepts. */
export function SlideTag({ children }: SlideTagProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-foreground/70">
      {children}
    </span>
  );
}
