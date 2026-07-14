import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { VmemPaths } from "@/components/svg-animations";

// hover / interactive animations
export function HoverSection() {
  return (
    <PlaygroundSection
      title="Hover / interactive"
      blurb="Held states driven by the cursor. Move over the icon to see them play."
    >
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
    </PlaygroundSection>
  );
}
