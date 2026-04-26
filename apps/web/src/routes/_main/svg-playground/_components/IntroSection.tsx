import { AnimationCard } from "./AnimationCard";
import { SectionHeading } from "./SectionHeading";
import { VmemPaths } from "@/components/svg-animations";

/**
 * Intro / first-paint animations (one-shot).
 *
 * Run once when the logo appears, then settle. The replay button on each card
 * remounts the SVG via a `key` change so the CSS animations restart from
 * frame 0 — a closer demo of the real first-paint experience than waiting for
 * a route transition.
 */
export function IntroSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Intro / first paint"
        blurb="One-shot reveals when the logo first lands on screen. Hit replay to retrigger."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimationCard
          number={4}
          title="Stroke draw-in"
          description="Outlines pen themselves on, then the fill blooms in behind."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-draw-in"
            >
              <VmemPaths normalizePath />
            </svg>
          )}
        />
        <AnimationCard
          number={5}
          title="Petal blossom"
          description="Each petal scales 0→1 with a soft overshoot — staggered like a flower."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-blossom"
            >
              <VmemPaths pathClassName="vmem-petal" />
            </svg>
          )}
        />
        <AnimationCard
          number={6}
          title="Convergence"
          description="Petals slide in from outside the frame and lock together."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-converge"
              style={{ overflow: "visible" }}
            >
              <VmemPaths
                leftClassName="conv-left"
                rightClassName="conv-right"
                topClassName="conv-top"
              />
            </svg>
          )}
        />
        <AnimationCard
          number={7}
          title="Flicker tune-in"
          description="Staccato opacity flashes that resolve into a steady fill — old TV vibes."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-tune-in"
            >
              <VmemPaths />
            </svg>
          )}
        />
      </div>
    </section>
  );
}
