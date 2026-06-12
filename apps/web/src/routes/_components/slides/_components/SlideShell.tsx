import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";

// ---------------------------------------------------------------------------
// Step context — provided by SlideDeck, consumed by reveal primitives
// ---------------------------------------------------------------------------

/**
 * The current build step for the active slide. 0 = initial state (no clicks
 * yet). Provided by SlideDeck; defaults to 0 so slides are usable standalone.
 */
export const SlideStepContext = createContext<number>(0);

// ---------------------------------------------------------------------------
// Animation primitives
// ---------------------------------------------------------------------------

/** Shared fade-up variant used by SlideReveal and SlideItem. */
const fadeUpVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

interface SlideRevealProps {
  children: ReactNode;
  /** Seconds to delay the entrance (use to stagger manual blocks). */
  delay?: number;
  className?: string;
  /**
   * Build step at which this element becomes visible. 0 = on slide entry
   * (default). Set to N to reveal on the Nth click advance within the slide.
   */
  step?: number;
}

/**
 * Wraps any content in a fade-up entrance. With the default step=0 it plays
 * on every slide mount. With step>0 it stays hidden until the presenter
 * clicks through to that build step, then animates in.
 */
export function SlideReveal({
  children,
  delay = 0,
  step = 0,
  className = "",
}: SlideRevealProps) {
  const contextStep = useContext(SlideStepContext);
  const isVisible = contextStep >= step;
  return (
    <motion.div
      initial={isVisible ? "show" : "hidden"}
      animate={isVisible ? "show" : "hidden"}
      variants={fadeUpVariants}
      transition={{
        duration: motionDuration.base,
        ease: motionEase,
        delay: isVisible ? delay : 0,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideStaggerProps {
  children: ReactNode;
  className?: string;
  /** Seconds before the first child starts animating. Default 0.1. */
  delayChildren?: number;
  /** Seconds between each child. Default 0.07. */
  staggerChildren?: number;
  /**
   * Build step at which this stagger group becomes visible. 0 = on slide
   * entry (default). The whole group reveals together; items still stagger.
   */
  step?: number;
}

/**
 * Container that staggers its `SlideItem` children one after another.
 * Use for card grids, bullet lists, and step rows. Add step>0 to gate the
 * entire group behind a build step click.
 */
export function SlideStagger({
  children,
  className = "",
  delayChildren = 0.1,
  staggerChildren = 0.07,
  step = 0,
}: SlideStaggerProps) {
  const contextStep = useContext(SlideStepContext);
  const isVisible = contextStep >= step;
  return (
    <motion.div
      initial={isVisible ? "show" : "hidden"}
      animate={isVisible ? "show" : "hidden"}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * A single animated child inside a `SlideStagger`. Inherits the stagger
 * timing from its parent — no delay prop needed here.
 */
export function SlideItem({ children, className = "" }: SlideItemProps) {
  return (
    <motion.div
      variants={fadeUpVariants}
      transition={{ duration: motionDuration.base, ease: motionEase }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

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
      className={`relative flex h-full w-full flex-col overflow-hidden px-20 py-16 ${center ? "items-center justify-center" : ""} ${className}`}
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
