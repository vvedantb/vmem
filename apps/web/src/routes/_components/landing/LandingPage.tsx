import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingAppStage } from "./LandingAppStage";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";
import { LandingHowItWorks } from "./LandingHowItWorks";
import { LandingNav } from "./LandingNav";
import { LandingRecallDemo } from "./LandingRecallDemo";
import { LandingSurfaces } from "./LandingSurfaces";
import "./landing.css";

export function LandingPage() {
  return (
    <div
      id="top"
      className="relative min-h-[100dvh] bg-background text-foreground"
    >
      <div className="relative">
        <LandingAmbientGraph />
        <LandingNav />
        <LandingHero />
      </div>

      <LandingAppStage />
      <LandingRecallDemo />
      <LandingHowItWorks />
      <LandingSurfaces />
      <LandingFooter />
    </div>
  );
}
