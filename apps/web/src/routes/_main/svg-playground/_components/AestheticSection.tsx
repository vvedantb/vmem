import { AnimationCard } from "./AnimationCard";
import { PlaygroundSection } from "./PlaygroundSection";
import { PATH_LEFT, VmemPaths } from "@/components/svg-animations";

const trailFollowingDotDemo = (
  <svg viewBox="0 0 210 204" className="vmem-svg">
    <VmemPaths />
    <circle r="6" fill="var(--color-danger)" opacity="0.9">
      <animateMotion dur="3s" repeatCount="indefinite" path={PATH_LEFT} />
    </circle>
  </svg>
);

const glowAuraPulseDemo = (
  <svg
    viewBox="0 0 210 204"
    className="vmem-svg"
    style={{ overflow: "visible" }}
  >
    <defs>
      <filter id="glow-aura-13" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3">
          <animate
            attributeName="stdDeviation"
            values="3;12;3"
            dur="3s"
            repeatCount="indefinite"
          />
        </feGaussianBlur>
      </filter>
    </defs>
    <g filter="url(#glow-aura-13)" opacity="0.55">
      <VmemPaths />
    </g>
    <VmemPaths />
  </svg>
);

// aesthetic / showpiece animations
export function AestheticSection() {
  return (
    <PlaygroundSection>
      <PlaygroundSection.Heading
        title="Aesthetic / showpiece"
        blurb="Loud, ambient, made for marketing — none of these belong inside the app shell."
      />
      <PlaygroundSection.Grid>
        <AnimationCard
          number={12}
          title="Trail-following dot"
          description="A glowing dot orbits along one petal's path via SMIL animateMotion."
        >
          {trailFollowingDotDemo}
        </AnimationCard>
        <AnimationCard
          number={13}
          title="Glow aura pulse"
          description="A blurred clone breathes underneath via SMIL on feGaussianBlur."
        >
          {glowAuraPulseDemo}
        </AnimationCard>
      </PlaygroundSection.Grid>
    </PlaygroundSection>
  );
}
