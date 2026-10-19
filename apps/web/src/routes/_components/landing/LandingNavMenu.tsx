import { IconBrandGithub } from "@tabler/icons-react";
import { LandingNavMenu as KitLandingNavMenu } from "@vvedantb/ui";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";

/**
 * Overflow menu below `md`. Section links do not fit a phone-width bar;
 * Sign in and Get started stay in the bar itself.
 */
export function LandingNavMenu() {
  return (
    <KitLandingNavMenu
      links={LANDING_NAV_LINKS}
      github={{
        href: VMEM_GITHUB_URL,
        icon: <IconBrandGithub size={16} aria-hidden />,
      }}
    />
  );
}
