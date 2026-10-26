import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { Button } from "@vvedantb/ui";
import { LANDING_HERO_CAPABILITIES } from "./landingContent";
import { KitLandingHero } from "./LandingReveal";

export function LandingHero() {
  return (
    <KitLandingHero
      eyebrow="Memory engine for AI agents"
      title={
        <>
          Memory your agents can{" "}
          <span className="font-medium tracking-tight text-foreground/85">
            actually use
          </span>
        </>
      }
      description="Store context from chats and tools, connect it in a graph, and retrieve the slice that matters — with a Context Trace that shows why each memory matched."
      actions={
        <>
          <SignUpButton mode="modal">
            <Button size="lg" className="w-full sm:w-auto sm:min-w-40">
              Get started
              <IconArrowRight size={16} aria-hidden />
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign in
            </Button>
          </SignInButton>
        </>
      }
      capabilities={LANDING_HERO_CAPABILITIES}
    />
  );
}
