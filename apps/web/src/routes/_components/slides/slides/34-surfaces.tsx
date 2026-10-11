import { RotatingShowcase } from "../_components/RotatingShowcase";

export function Slide34Surfaces() {
  return (
    <RotatingShowcase
      kicker="More of the app"
      title="Built for your whole workflow."
      panels={[
        { src: "/slides/app-skills.png", label: "Skills" },
        { src: "/slides/app-home.png", label: "Dashboard" },
        { src: "/slides/app-connectors.png", label: "Connectors" },
      ]}
    />
  );
}
