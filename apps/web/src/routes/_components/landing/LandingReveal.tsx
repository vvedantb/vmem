import { motion } from "motion/react";
import { createLandingKit } from "@vvedantb/ui";

export {
  LandingFeatureCard,
  LandingLattice,
  LandingSection,
  LandingSectionHeading,
  landingItemVariants,
  landingPanelClass,
  landingShellClass,
} from "@vvedantb/ui";

export const {
  LandingReveal,
  LandingRevealItem,
  LandingHero: KitLandingHero,
  LandingNav: KitLandingNav,
  LandingCta: KitLandingCta,
} = createLandingKit({ motion });
