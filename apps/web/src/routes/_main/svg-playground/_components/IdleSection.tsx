import { AnimationCard } from "./AnimationCard";
import { SectionHeading } from "./SectionHeading";
import { VmemPaths } from "@/components/svg-animations";

// idle / always-on animations
export function IdleSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Idle / always-on"
        blurb="Subtle ambient motion that signals the app is alive without distracting."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>
    </section>
  );
}
