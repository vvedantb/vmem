import { useEffect, useRef, useState } from "react";
import { SLIDES } from "../slides/index";
import { SlideStepContext, SlideThemeContext } from "./SlideShell";

const DESIGN_W = 1280;
const DESIGN_H = 720;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface SlideMiniPreviewProps {
  /** 1-based slide index. */
  slideNumber: number;
  /** Build step to render; defaults to the slide's final step. */
  buildStep?: number;
  /** Optional label above the thumbnail. */
  label?: string;
}

/** Small 16:9 read-only slide thumbnail for the presenter pop-out. */
export function SlideMiniPreview({
  slideNumber,
  buildStep,
  label,
}: SlideMiniPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  const index = clamp(slideNumber - 1, 0, SLIDES.length - 1);
  const entry = SLIDES[index];
  const step = buildStep ?? entry.steps;
  const { Component, theme } = entry;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      const node = containerRef.current;
      if (!node) return;
      const { width } = node.getBoundingClientRect();
      setScale(width / DESIGN_W);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-1.5">
      {label ? <p className="text-xs font-medium text-muted">{label}</p> : null}
      <div
        ref={containerRef}
        // `text-foreground` pins a themed colour baseline on this dark/light
        // container. Some slides use `text-foreground/<alpha>`, which Tailwind
        // drops to an invalid colour rule; without a baseline here those
        // elements inherit colour from the light presenter chrome and render
        // black on dark slides. Setting it means they inherit the right colour.
        className={`relative aspect-video w-full overflow-hidden rounded-xl bg-background text-foreground ${theme}`}
      >
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
          }}
        >
          <SlideThemeContext.Provider value={theme}>
            <SlideStepContext.Provider value={step}>
              <Component />
            </SlideStepContext.Provider>
          </SlideThemeContext.Provider>
        </div>
      </div>
    </div>
  );
}
