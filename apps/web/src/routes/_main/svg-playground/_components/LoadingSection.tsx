import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

const petalSequencerDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-sequencer">
    <VmemPaths pathClassName="vmem-petal" />
  </svg>
);

const strokeTraceDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-trace">
    <VmemPaths normalizePath />
  </svg>
);

// loading / processing animations
export function LoadingSection() {
  return (
    <PlaygroundSection>
      <PlaygroundSection.Heading
        title="Loading / processing"
        blurb="Cycling motion that occupies attention while async work is in flight."
      />
      <PlaygroundSection.Grid>
        <AnimationCard
          number={2}
          title="Petal sequencer"
          description="Each petal lights up in turn — left, right, top — like a queue."
        >
          {petalSequencerDemo}
        </AnimationCard>
        <AnimationCard
          number={3}
          title="Stroke trace loop"
          description="Outline draws and erases on a normalised dasharray — chase effect."
        >
          {strokeTraceDemo}
        </AnimationCard>
      </PlaygroundSection.Grid>
    </PlaygroundSection>
  );
}
