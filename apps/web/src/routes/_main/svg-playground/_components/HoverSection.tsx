import { AnimationCard } from "./AnimationCard";
import { SectionHeading } from "./SectionHeading";
import { VmemPaths } from "@/components/svg-animations";

// hover / interactive animations
export function HoverSection() {
  return (
    <section className="space-y-4">
      <SectionHeading
        title="Hover / interactive"
        blurb="Held states driven by the cursor. Move over the icon to see them play."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimationCard
          number={11}
          title="Magnetic separation"
          description="Petals push apart on hover and reseal on leave — playful tension."
          hoverHint
          render={() => (
            <svg
              viewBox="0 0 210 204"
              className="vmem-svg vmem-magnetic"
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
