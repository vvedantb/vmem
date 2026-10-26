import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { AppWordmark, Button } from "@vvedantb/ui";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";
import { LandingNavMenu } from "./LandingNavMenu";
import { KitLandingNav } from "./LandingReveal";

export function LandingNav() {
  return (
    <KitLandingNav
      brand={<AppWordmark app="vmem" />}
      homeLabel="vmem home"
      links={LANDING_NAV_LINKS}
      github={{
        href: VMEM_GITHUB_URL,
        label: "vmem on GitHub",
        icon: <IconBrandGithub size={18} />,
      }}
      actions={
        <>
          <SignInButton mode="modal">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted hover:text-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="px-3.5">
              Get started
            </Button>
          </SignUpButton>
        </>
      }
      menu={<LandingNavMenu />}
    />
  );
}
