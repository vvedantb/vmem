import { SignInButton } from "@clerk/clerk-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import { VmemBrand } from "@/components/shell/VmemBrand";
import { AGENT_LOGIN_PATH } from "@/lib/dev-agent-login";
import { LANDING_NAV_LINKS, VMEM_GITHUB_URL } from "./landingContent";
import { landingShellClass } from "./LandingReveal";

export function LandingFooter() {
  return (
    <footer className="border-t border-separator">
      <div
        className={`${landingShellClass} flex flex-col gap-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10 sm:flex-row sm:items-center sm:justify-between`}
      >
        <div>
          <VmemBrand iconSize={18} />
          <p className="mt-3 max-w-sm text-pretty text-xs leading-relaxed text-muted">
            Graph storage, vector recall, and MCP-ready integrations for any
            agent stack.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
          aria-label="Footer"
        >
          {LANDING_NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="max-sm:py-1 text-sm text-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <SignInButton mode="modal">
            <Button
              variant="link"
              className="h-auto p-0 text-sm text-muted hover:text-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          {import.meta.env.DEV ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm text-muted hover:text-foreground active:scale-100"
              onClick={() => {
                window.location.href = AGENT_LOGIN_PATH;
              }}
            >
              Continue without an account
            </Button>
          ) : null}
          <a
            href={VMEM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="vmem on GitHub"
            className="max-sm:py-1 text-muted hover:text-foreground"
          >
            <IconBrandGithub size={18} />
          </a>
        </nav>
      </div>
    </footer>
  );
}
