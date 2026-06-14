import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SLIDES } from "./slides/index";
import { SlideStepContext } from "./_components/SlideShell";

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
  // Current build step within the active slide (ephemeral — not in URL).
  const [step, setStep] = useState(0);
  // Track the last slide we navigated to via go() so we can detect
  // external URL changes (browser back/forward) and reset step.
  const lastNavigatedSlide = useRef(slide);

  useEffect(() => {
    if (slide !== lastNavigatedSlide.current) {
      lastNavigatedSlide.current = slide;
      setStep(0);
    }
  }, [slide]);

  const index = clamp(slide - 1, 0, TOTAL - 1);

  /**
   * Move forward or backward through slides AND build steps.
   *  delta > 0 = advance: reveal next build step, or go to next slide at step 0.
   *  delta < 0 = retreat: hide last revealed step, or go to previous slide fully revealed.
   *  delta = 0 with a slide number = jump directly (Home/End).
   */
  const go = useCallback(
    (next: number, opts?: { forceStep?: number; delta?: number }) => {
      const delta = opts?.delta;

      // Step-aware forward/backward when delta is provided.
      if (delta === 1) {
        const currentSteps = SLIDES[index].steps;
        if (step < currentSteps) {
          setStep(step + 1);
          return;
        }
        // Slide fully revealed — advance to next slide.
        const nextSlide = clamp(slide + 1, 1, TOTAL);
        if (nextSlide === slide) return;
        lastNavigatedSlide.current = nextSlide;
        setDirection(1);
        setStep(0);
        onNavigate(nextSlide);
        return;
      }

      if (delta === -1) {
        if (step > 0) {
          setStep(step - 1);
          return;
        }
        // At step 0 — go to previous slide fully revealed.
        const prevSlide = clamp(slide - 1, 1, TOTAL);
        if (prevSlide === slide) return;
        lastNavigatedSlide.current = prevSlide;
        setDirection(-1);
        setStep(SLIDES[clamp(prevSlide - 1, 0, TOTAL - 1)].steps);
        onNavigate(prevSlide);
        return;
      }

      // Direct jump (Home / End).
      const clamped = clamp(next, 1, TOTAL);
      if (clamped === slide && opts?.forceStep === undefined) return;
      lastNavigatedSlide.current = clamped;
      setDirection(clamped > slide ? 1 : -1);
      setStep(opts?.forceStep ?? 0);
      onNavigate(clamped);
    },
    [slide, step, index, onNavigate],
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
          go(0, { delta: 1 });
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(0, { delta: -1 });
          break;
        case "Home":
          e.preventDefault();
          go(1, { forceStep: 0 });
          break;
        case "End":
          e.preventDefault();
          go(TOTAL, { forceStep: SLIDES[TOTAL - 1].steps });
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
      go(0, { delta: -1 });
    } else if (x > third * 2) {
      go(0, { delta: 1 });
    }
  }

  const { Component, theme, id } = SLIDES[index];
  // The blank opener stays pure black so the title's entrance plays from
  // nothing when the presenter clicks forward.
  const showOrbs = id !== "00";

  // Apply the slide's theme on <html> while presenting. A local wrapper
  // class is not enough: opacity-modified token utilities (e.g.
  // text-foreground/50) resolve against the html-level theme vars, not a
  // nested .light/.dark wrapper. Restore the user's theme on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const hadLight = root.classList.contains("light");
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    return () => {
      root.classList.remove("dark", "light");
      if (hadDark) root.classList.add("dark");
      if (hadLight) root.classList.add("light");
    };
  }, [theme]);

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
      className={`fixed inset-0 flex items-center justify-center overflow-hidden bg-background ${theme}`}
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
        className="relative shrink-0 cursor-pointer overflow-hidden"
        onClick={handleStageClick}
        role="presentation"
      >
        {/* Ambient orb glows — inside the stage so they're part of the
            slide composition and scale with it. Dark slides get soft white
            orbs; light slides get a gentler warm cream aura (a black glow
            on a light background reads as smog). */}
        {/* Always mounted so the orbs fade (not pop) when leaving the black
            opener — a hard mount flashed the white glow in mid-transition. */}
        <motion.div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          animate={{ opacity: showOrbs ? 1 : 0 }}
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          <motion.div
            className={`absolute -left-44 -top-40 h-[560px] w-[560px] rounded-full blur-[110px] ${
              theme === "dark"
                ? "bg-foreground opacity-[0.14]"
                : "bg-[#e3d5b8] opacity-[0.26]"
            }`}
            animate={{ x: [0, 70, 0], y: [0, 50, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`absolute -bottom-52 -right-40 h-[640px] w-[640px] rounded-full blur-[120px] ${
              theme === "dark"
                ? "bg-foreground opacity-[0.12]"
                : "bg-[#e8dcc4] opacity-[0.22]"
            }`}
            animate={{ x: [0, -80, 0], y: [0, -55, 0] }}
            transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className={`absolute left-[52%] top-[58%] h-[380px] w-[380px] rounded-full blur-[100px] ${
              theme === "dark"
                ? "bg-foreground opacity-[0.09]"
                : "bg-[#e3d5b8] opacity-[0.16]"
            }`}
            animate={{ x: [0, 55, 0], y: [0, -65, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

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
            <SlideStepContext.Provider value={step}>
              <Component />
            </SlideStepContext.Provider>
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

      {/* Build-step indicator — shows reveals consumed vs total for this
          slide so you know whether another click reveals more content or
          advances to the next slide. Hidden on slides with no build steps. */}
      {SLIDES[index].steps > 0 ? (
        <div className="pointer-events-none absolute bottom-8 right-4 flex items-center gap-1.5 font-mono text-xs tabular-nums">
          <span
            className={
              step < SLIDES[index].steps
                ? "text-foreground/70"
                : "text-muted/40"
            }
          >
            {step < SLIDES[index].steps ? "more ↓" : "end"}
          </span>
          <span className="text-muted/40">
            {step} / {SLIDES[index].steps}
          </span>
        </div>
      ) : null}

      {/* Slide counter */}
      <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs tabular-nums text-muted/40">
        {slide} / {TOTAL}
      </div>
    </div>
  );
}
