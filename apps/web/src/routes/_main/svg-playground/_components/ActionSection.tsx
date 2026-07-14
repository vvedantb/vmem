import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

const memoryAbsorbDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-absorb">
    <VmemPaths />
  </svg>
);

const pulseGlowDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg vmem-pulse-glow">
    <VmemPaths />
  </svg>
);

const forkSnapDemo = (
  <svg
    viewBox="0 0 210 204"
    className="vmem-svg vmem-fork"
    style={{ overflow: "visible" }}
  >
    <VmemPaths
      leftClassName="conv-left"
      rightClassName="conv-right"
      topClassName="conv-top"
    />
  </svg>
);

// action feedback animations (one-shot, click to replay)
export function ActionSection() {
  return (
    <PlaygroundSection>
      <PlaygroundSection.Heading
        title="Action feedback"
        blurb="Short reactive bursts tied to a discrete user action. Replay to retrigger."
      />
      <PlaygroundSection.Grid>
        <AnimationCard
          number={8}
          title="Memory absorb"
          description="Squish toward the centre then snap back — a 'gulp' for save events."
          oneShot
        >
          {memoryAbsorbDemo}
        </AnimationCard>
        <AnimationCard
          number={9}
          title="Pulse-and-glow"
          description="Single scale-up paired with a drop-shadow flash — confirmation feel."
          oneShot
        >
          {pulseGlowDemo}
        </AnimationCard>
        <AnimationCard
          number={10}
          title="Fork-and-snap"
          description="Petals jump apart and immediately rejoin — useful for branching ops."
          oneShot
        >
          {forkSnapDemo}
        </AnimationCard>
      </PlaygroundSection.Grid>
    </PlaygroundSection>
  );
}
