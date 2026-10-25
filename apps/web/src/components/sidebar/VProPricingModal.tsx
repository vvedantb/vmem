import { SignedIn } from "@clerk/clerk-react";
import { CheckoutButton } from "@clerk/clerk-react/experimental";
import { PricingModal } from "@vvedantb/ui";
import { V_PRO_CLERK_PLAN_ID, V_PRO_COPY } from "@/lib/vPlan";

const PRO_PLAN_ID = "pro";

export function VProPricingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { free, pro } = V_PRO_COPY;
  return (
    <PricingModal
      open={open}
      onClose={onClose}
      title="V plans"
      apps={["vibot", "verve", "velth", "vmem", "vhub"]}
      headline={V_PRO_COPY.headline}
      finePrint={V_PRO_COPY.finePrint}
      defaultBillingPeriod="year"
      plans={[
        {
          id: "free",
          name: free.name,
          price: free.price,
          current: true,
          benefits: free.benefits.map((label) => ({ label })),
        },
        {
          id: PRO_PLAN_ID,
          name: pro.name,
          price: pro.price,
          featured: true,
          ctaLabel: pro.ctaLabel,
          intro: pro.intro,
          benefits: pro.benefits.map((label) => ({ label })),
        },
      ]}
      renderCheckout={(button, plan, period) =>
        plan.id === PRO_PLAN_ID ? (
          <SignedIn>
            <CheckoutButton
              planId={V_PRO_CLERK_PLAN_ID}
              planPeriod={period === "year" ? "annual" : "month"}
            >
              {button}
            </CheckoutButton>
          </SignedIn>
        ) : (
          button
        )
      }
    />
  );
}
