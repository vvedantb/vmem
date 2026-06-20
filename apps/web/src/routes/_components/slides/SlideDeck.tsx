import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { motionDuration, motionEase } from "@vmem/ui";
import { SLIDES } from "./slides/index";
import { SlideStepContext } from "./_components/SlideShell";

const DESIGN_W = 1280;
const DESIGN_H = 720;
const TOTAL = SLIDES.length;
// Default gap between auto-revealed build steps; per-slide `staggerMs` overrides.
const DEFAULT_STAGGER_MS = 1000;

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
  // Transition direction (1 = forward, -1 = back), derived from the change in
  // the `slide` prop rather than set only inside `go`. Deriving it means
  // externally driven changes — a viewer following a live presenter — also
  // animate in the correct direction, not just the local presenter's clicks.
  const prevSlideRef = useRef(slide);
  const direction = slide >= prevSlideRef.current ? 1 : -1;
  // Current build step within the active slide (ephemeral — not in URL).
  // Auto-advances on a timer (see effect below) so each slide's content
  // reveals in a stagger without the presenter clicking through it.
  const [step, setStep] = useState(0);

  const index = clamp(slide - 1, 0, TOTAL - 1);

  // Track the last rendered slide so `direction` (derived above) reflects the
  // next change. Runs after paint, so the current render still sees the prior
  // value and computes the right enter/exit direction.
  useEffect(() => {
    prevSlideRef.current = slide;
  }, [slide]);

  // Auto-play the slide's build steps: reset to 0 on slide change, then reveal
  // each step in turn on a fixed stagger so nothing pops in all at once.
  useEffect(() => {
    setStep(0);
    const entry = SLIDES[clamp(slide - 1, 0, TOTAL - 1)];
    if (entry.steps === 0) return;
    const stagger = entry.staggerMs ?? DEFAULT_STAGGER_MS;
    const timers: number[] = [];
    for (let s = 1; s <= entry.steps; s++) {
      timers.push(window.setTimeout(() => setStep(s), stagger * s));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [slide]);

  /**
   * Navigate between slides. Build steps auto-play on a timer (see above), so
   * forward/back move whole slides — no per-step clicking.
   *  delta > 0 = next slide, delta < 0 = previous slide.
   *  delta omitted with a slide number = jump directly (Home/End).
   */
  const go = useCallback(
    (next: number, opts?: { delta?: number }) => {
      const delta = opts?.delta;
      const target =
        delta === 1
          ? clamp(slide + 1, 1, TOTAL)
          : delta === -1
            ? clamp(slide - 1, 1, TOTAL)
            : clamp(next, 1, TOTAL);
      if (target === slide) return;
      onNavigate(target);
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
          go(0, { delta: 1 });
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(0, { delta: -1 });
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
      go(0, { delta: -1 });
    } else if (x > third * 2) {
      go(0, { delta: 1 });
    }
  }

  const { Component, theme, id } = SLIDES[index];
  // No deck orbs on the opener (pure black) or the title (it has its own
  // LandingAmbientGraph atmosphere). With both orb-free, the black↔title
  // transition has no orb change in either direction — so the orbs never
  // fade in/out over those slides and can't flash. They appear from slide 02.
  const showOrbs = id !== "00" && id !== "01";

  // The user's real theme, so we can restore it when leaving the deck.
  const { resolvedTheme } = useTheme();

  // Force the slide's theme on <html> while presenting. A local wrapper class
  // is not enough: opacity-modified token utilities (text-foreground/50) and
  // `dark:` variants resolve against the html-level theme. The app drives the
  // class through next-themes, which re-asserts the user's theme whenever the
  // Convex settings query resolves — clobbering ours and leaving e.g. a light
  // slide rendering with dark (white) text. So we re-apply on every <html>
  // class mutation via an observer; on unmount we hand control back by
  // restoring the user's resolved theme.
  useEffect(() => {
    const root = document.documentElement;
    const opposite = theme === "dark" ? "light" : "dark";
    const enforce = () => {
      if (
        root.classList.contains(opposite) ||
        !root.classList.contains(theme)
      ) {
        root.classList.remove("dark", "light");
        root.classList.add(theme);
      }
    };
    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      const restore = resolvedTheme === "light" ? "light" : "dark";
      root.classList.remove("dark", "light");
      root.classList.add(restore);
    };
  }, [theme, resolvedTheme]);

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
            on a light background reads as smog).

            Always mounted; visibility is a plain CSS opacity transition (not
            framer) because framer didn't reliably re-animate this persistent
            layer across slide changes. Off on the opener + title so the
            black↔title boundary never toggles the orbs (no flash); they fade
            in/out only at the slide-02 boundary, gently over 1.6s. */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-[1600ms] ease-in-out"
          aria-hidden
          style={{ opacity: showOrbs ? 1 : 0 }}
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
        </div>

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

      {/* Slide counter */}
      <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs tabular-nums text-muted/40">
        {slide} / {TOTAL}
      </div>
    </div>
  );
}
