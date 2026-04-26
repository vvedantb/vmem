import { AnimationCard } from "./AnimationCard";
import { SectionHeading } from "./SectionHeading";
import { VmemPaths } from "@/components/svg-animations";

/**
 * Loading / processing animations.
 *
 * These signal "something is happening" — they're meant to occupy attention
 * during a wait, so they cycle faster and use stronger visual changes than
 * the idle set.
 */
export function LoadingSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Loading / processing"
        blurb="Cycling motion that occupies attention while async work is in flight."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimationCard
          number={2}
          title="Petal sequencer"
          description="Each petal lights up in turn — left, right, top — like a queue."
          render={() => (
            <svg viewBox="0 0 210 204" className="vmem-svg vmem-sequencer">
              <VmemPaths pathClassName="vmem-petal" />
            </svg>
          )}
        />
        <AnimationCard
          number={3}
          title="Stroke trace loop"
          description="Outline draws and erases on a normalised dasharray — chase effect."
          render={() => (
            <svg viewBox="0 0 210 204" className="vmem-svg vmem-trace">
              <VmemPaths normalizePath />
            </svg>
          )}
        />
      </div>
    </section>
  );
}
