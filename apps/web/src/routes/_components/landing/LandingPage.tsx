import { LandingPageLayout } from "@vvedantb/ui";
import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingAppStage } from "./LandingAppStage";
import { LandingCta } from "./LandingCta";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";
import { LandingHowItWorks } from "./LandingHowItWorks";
import { LandingNav } from "./LandingNav";
import { LandingRecallDemo } from "./LandingRecallDemo";
import { LandingSurfaces } from "./LandingSurfaces";
import "@vvedantb/ui/landing.css";

export function LandingPage() {
  return (
    <LandingPageLayout
      nav={<LandingNav />}
      heroBackdrop={<LandingAmbientGraph />}
      hero={<LandingHero />}
      footer={<LandingFooter />}
    >
      <LandingAppStage />
      <LandingRecallDemo />
      <LandingHowItWorks />
      <LandingSurfaces />
      <LandingCta />
    </LandingPageLayout>
  );
}
