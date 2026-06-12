import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SLIDES } from "./slides/index";

const DESIGN_W = 1280;
const DESIGN_H = 720;
const TOTAL = SLIDES.length;

interface SlideDeckProps {
  /** 1-based current slide index. */
  slide: number;
  onNavigate: (slide: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function SlideDeck({ slide, onNavigate }: SlideDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // direction: 1 = forward, -1 = backward
  const [direction, setDirection] = useState(1);

  const go = useCallback(
    (next: number) => {
      const clamped = clamp(next, 1, TOTAL);
      if (clamped === slide) return;
      setDirection(clamped > slide ? 1 : -1);
      onNavigate(clamped);
    },
    [slide, onNavigate],
  );

  // Compute scale on mount and resize
  useEffect(() => {
    function measure() {
      setScale(
        Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H),
      );
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          go(slide + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(slide - 1);
          break;
        case "Home":
          e.preventDefault();
          go(1);
          break;
        case "End":
          e.preventDefault();
          go(TOTAL);
          break;
        case "f":
        case "F":
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => undefined);
          } else {
            document.exitFullscreen().catch(() => undefined);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slide, go]);

  // Click left/right thirds
  function handleStageClick(e: React.MouseEvent<HTMLDivElement>) {
    // Don't navigate when the click lands on an interactive element
    // inside a slide (e.g. the mock memory-graph nodes).
    if (
      e.target instanceof Element &&
      e.target.closest('button, a, [role="button"]')
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) {
      go(slide - 1);
    } else if (x > third * 2) {
      go(slide + 1);
    }
  }

  const index = clamp(slide - 1, 0, TOTAL - 1);
  const { Component } = SLIDES[index];

  const variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 40 : -40,
    }),
    center: {
      opacity: 1,
      x: 0,
      transition: { duration: motionDuration.base, ease: motionEase },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -24 : 24,
      transition: { duration: motionDuration.fast, ease: motionEase },
    }),
  };

  const progressPct = ((slide - 1) / Math.max(1, TOTAL - 1)) * 100;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background"
    >
      {/* Scaled stage */}
      <div
        ref={stageRef}
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="relative cursor-pointer overflow-hidden"
        onClick={handleStageClick}
        role="presentation"
      >
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={slide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0"
          >
            <Component />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar — outside scaled stage so it's always full width */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-foreground/5">
        <div
          className="h-full bg-foreground/25 transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Slide counter */}
      <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs tabular-nums text-muted/40">
        {slide} / {TOTAL}
      </div>
    </div>
  );
}
