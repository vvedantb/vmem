import { RotatingShowcase } from "../_components/RotatingShowcase";

export function Slide15Showcase() {
  return (
    <RotatingShowcase
      kicker="Showcase"
      title="The product, today."
      panels={[
        { src: "/slides/app-graph.png", label: "Memory graph" },
        { src: "/slides/app-home.png", label: "Dashboard" },
        { src: "/slides/app-memories.png", label: "Memories" },
      ]}
    />
  );
}
