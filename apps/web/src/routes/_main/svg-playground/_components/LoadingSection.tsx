import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

// loading / processing animations
export function LoadingSection() {
  return (
    <PlaygroundSection
      title="Loading / processing"
      blurb="Cycling motion that occupies attention while async work is in flight."
    >
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
    </PlaygroundSection>
  );
}
