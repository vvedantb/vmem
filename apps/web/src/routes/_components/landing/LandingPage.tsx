import { SignInButton } from "@clerk/clerk-react";
import { Button, LandingPageLayout, SiteHeader } from "@vvedantb/ui";
import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingAppStage } from "./LandingAppStage";
import { LandingCta } from "./LandingCta";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";
import { LandingHowItWorks } from "./LandingHowItWorks";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";
import { LandingRecallDemo } from "./LandingRecallDemo";
import { LandingSurfaces } from "./LandingSurfaces";
import "@vvedantb/ui/landing.css";

export function LandingPage() {
  return (
    <LandingPageLayout
      nav={
        <SiteHeader
          app="vmem"
          homeHref="#top"
          homeLabel="vmem home"
          links={LANDING_NAV_LINKS}
          githubUrl={VMEM_GITHUB_URL}
          cta={
            <SignInButton mode="modal">
              <Button size="sm" className="rounded-full">
                Sign in
              </Button>
            </SignInButton>
          }
        />
      }
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
