import { SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import { LandingReveal, landingShellClass } from "./LandingReveal";

export function LandingCta() {
  return (
    <div className="landing-atmosphere landing-grain relative overflow-hidden border-t border-separator">
      <section className={`${landingShellClass} relative z-10 py-20 sm:py-28`}>
        <LandingReveal className="flex flex-col items-center text-center">
          <h2 className="max-w-2xl text-balance font-instrumentSerif text-3xl leading-[1.1] text-foreground sm:text-5xl">
            Put memory under the agents you already use
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted sm:text-base">
            Create an account, open a profile, add a memory. Check it shows up
            on the graph.
          </p>
          <div className="mt-9">
            <SignUpButton mode="modal">
              <Button size="lg" className="sm:min-w-40">
                Get started
                <IconArrowRight size={16} aria-hidden />
              </Button>
            </SignUpButton>
          </div>
        </LandingReveal>
      </section>
    </div>
  );
}
