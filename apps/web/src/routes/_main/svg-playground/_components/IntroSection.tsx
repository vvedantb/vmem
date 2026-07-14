import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

const strokeDrawInDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-draw-in">
    <VmemPaths normalizePath />
  </svg>
);

const petalBlossomDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-blossom">
    <VmemPaths pathClassName="vmem-petal" />
  </svg>
);

const convergenceDemo = (
  <svg
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
);

const flickerTuneInDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-tune-in">
    <VmemPaths />
  </svg>
);

// intro / first-paint animations (one-shot)
export function IntroSection() {
  return (
    <PlaygroundSection>
      <PlaygroundSection.Heading
        title="Intro / first paint"
        blurb="One-shot reveals when the logo first lands on screen. Hit replay to retrigger."
      />
      <PlaygroundSection.Grid>
        <AnimationCard
          number={4}
          title="Stroke draw-in"
          description="Outlines pen themselves on, then the fill blooms in behind."
          oneShot
        >
          {strokeDrawInDemo}
        </AnimationCard>
        <AnimationCard
          number={5}
          title="Petal blossom"
          description="Each petal scales 0→1 with a soft overshoot — staggered like a flower."
          oneShot
        >
          {petalBlossomDemo}
        </AnimationCard>
        <AnimationCard
          number={6}
          title="Convergence"
          description="Petals slide in from outside the frame and lock together."
          oneShot
        >
          {convergenceDemo}
        </AnimationCard>
        <AnimationCard
          number={7}
          title="Flicker tune-in"
          description="Staccato opacity flashes that resolve into a steady fill — old TV vibes."
          oneShot
        >
          {flickerTuneInDemo}
        </AnimationCard>
      </PlaygroundSection.Grid>
    </PlaygroundSection>
  );
}
