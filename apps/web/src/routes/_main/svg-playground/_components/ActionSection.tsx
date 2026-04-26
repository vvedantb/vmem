import { AnimationCard } from "./AnimationCard";
import { SectionHeading } from "./SectionHeading";
import { VmemPaths } from "@/components/svg-animations";

/**
 * Action feedback animations (one-shot, click to replay).
 *
 * Triggered in response to a user action — saving a memory, hitting send,
 * confirming a destructive op. Should feel snappy: under a second total.
 */
export function ActionSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Action feedback"
        blurb="Short reactive bursts tied to a discrete user action. Replay to retrigger."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimationCard
          number={8}
          title="Memory absorb"
          description="Squish toward the centre then snap back — a 'gulp' for save events."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-absorb"
            >
              <VmemPaths />
            </svg>
          )}
        />
        <AnimationCard
          number={9}
          title="Pulse-and-glow"
          description="Single scale-up paired with a drop-shadow flash — confirmation feel."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
              viewBox="0 0 210 204"
              className="vmem-svg vmem-pulse-glow"
            >
              <VmemPaths />
            </svg>
          )}
        />
        <AnimationCard
          number={10}
          title="Fork-and-snap"
          description="Petals jump apart and immediately rejoin — useful for branching ops."
          oneShot
          render={(replayKey) => (
            <svg
              key={replayKey}
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
          )}
        />
      </div>
    </section>
  );
}
