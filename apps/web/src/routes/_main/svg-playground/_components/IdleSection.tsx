import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

// idle / always-on animations
export function IdleSection() {
  return (
    <PlaygroundSection
      title="Idle / always-on"
      blurb="Subtle ambient motion that signals the app is alive without distracting."
    >
      <AnimationCard
        number={1}
        title="Breathing pulse"
        description="Gentle scale + opacity loop — the calmest possible 'I'm alive'."
        render={() => (
          <svg viewBox="0 0 210 204" className="vmem-svg vmem-breathing">
            <VmemPaths />
          </svg>
        )}
      />
    </PlaygroundSection>
  );
}
