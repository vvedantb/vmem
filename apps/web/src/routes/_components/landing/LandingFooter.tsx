import { SignInButton } from "@clerk/clerk-react";
import { Button } from "@vmem/ui";
import { VmemBrand } from "@/components/shell/VmemBrand";
import { AGENT_LOGIN_PATH } from "@/lib/dev-agent-login";
import { landingShellClass } from "./LandingReveal";

export function LandingFooter() {
  return (
    <footer
      className={`${landingShellClass} pb-[max(2rem,env(safe-area-inset-bottom))] pt-8`}
    >
      <div className="flex flex-col gap-6 border-t border-separator py-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <VmemBrand />
          <p className="mt-3 max-w-sm text-pretty text-xs leading-relaxed text-muted">
            Graph storage, vector recall, and MCP-ready integrations for any
            agent stack.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm text-muted hover:text-foreground active:scale-100"
            onClick={() => {
              window.location.href = AGENT_LOGIN_PATH;
            }}
          >
            Continue without an account →
          </Button>
        </div>
      </div>
    </footer>
  );
}
