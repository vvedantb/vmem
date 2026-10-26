import { SignInButton } from "@clerk/clerk-react";
import { IconBrandGithub } from "@tabler/icons-react";
import {
  AppWordmark,
  Button,
  LandingFooter as KitLandingFooter,
  landingFooterButtonClass,
} from "@vvedantb/ui";
import { AGENT_LOGIN_PATH } from "@/lib/dev-agent-login";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";

export function LandingFooter() {
  return (
    <KitLandingFooter
      brand={<AppWordmark app="vmem" />}
      tagline="Graph storage, vector recall, and MCP-ready integrations for any agent stack."
      links={LANDING_NAV_LINKS}
      actions={
        <>
          <SignInButton mode="modal">
            <Button variant="link" className={landingFooterButtonClass}>
              Sign in
            </Button>
          </SignInButton>
          {import.meta.env.DEV ? (
            <Button
              type="button"
              variant="link"
              className={`${landingFooterButtonClass} active:scale-100`}
              onClick={() => {
                window.location.href = AGENT_LOGIN_PATH;
              }}
            >
              Continue without an account
            </Button>
          ) : null}
        </>
      }
      github={{
        href: VMEM_GITHUB_URL,
        label: "vmem on GitHub",
        icon: <IconBrandGithub size={18} />,
      }}
    />
  );
}
