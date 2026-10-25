import { SignedIn } from "@clerk/clerk-react";
import { CheckoutButton } from "@clerk/clerk-react/experimental";
import { PricingModal } from "@vvedantb/ui";
import { V_PRO_CLERK_PLAN_ID, V_PRO_COPY } from "@/lib/vPlan";

export function VProPricingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <PricingModal
      open={open}
      onClose={onClose}
      title={V_PRO_COPY.title}
      description={V_PRO_COPY.description}
      logo={{ dark: "/icon.png", light: "/icon.png" }}
      wordmark="vmem"
      price={V_PRO_COPY.pricePerMonth}
      yearly={V_PRO_COPY.yearly}
      defaultBillingPeriod="year"
      tagline={V_PRO_COPY.tagline}
      features={V_PRO_COPY.features}
      ctaLabel="Get V Pro"
      renderCheckout={(button, period) => (
        <SignedIn>
          <CheckoutButton
            planId={V_PRO_CLERK_PLAN_ID}
            planPeriod={period === "year" ? "annual" : "month"}
          >
            {button}
          </CheckoutButton>
        </SignedIn>
      )}
    />
  );
}
