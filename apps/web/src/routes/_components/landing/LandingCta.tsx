import { SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { Button } from "@vvedantb/ui";
import { KitLandingCta } from "./LandingReveal";

export function LandingCta() {
  return (
    <KitLandingCta
      title="Put memory under the agents you already use"
      description="Create an account, open a profile, add a memory. Check it shows up on the graph."
      action={
        <SignUpButton mode="modal">
          <Button size="lg" className="sm:min-w-40">
            Get started
            <IconArrowRight size={16} aria-hidden />
          </Button>
        </SignUpButton>
      }
    />
  );
}
