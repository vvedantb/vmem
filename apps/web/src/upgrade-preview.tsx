// Dev-only screenshot harness. Open /upgrade-preview.html with `pnpm dev`.
// Not in the Vite build input, so `vite build` never emits it.
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AppMark,
  PricingModal,
  SidebarUpgradeCard,
  TooltipProvider,
} from "@vvedantb/ui";
import { V_PRO_COPY } from "@/lib/vPlan";
import "./globals.css";

const { free, pro } = V_PRO_COPY;

function Preview() {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen gap-8 bg-background p-8 text-foreground">
        <div
          className="flex shrink-0 border border-separator"
          style={{ width: "var(--vmem-sidebar-width)" }}
        >
          <div
            className="flex shrink-0 items-start justify-center border-r border-separator pt-3"
            style={{ width: "var(--vmem-sidebar-rail-width)" }}
          >
            <AppMark app="vmem" size={22} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-3">
            <SidebarUpgradeCard onUpgrade={() => {}} />
          </div>
        </div>
        <div
          className="flex items-end border border-separator p-3"
          style={{ width: "var(--vmem-sidebar-rail-width)" }}
        >
          <SidebarUpgradeCard collapsed onUpgrade={() => {}} />
        </div>
      </div>
      <PricingModal
        open
        onClose={() => {}}
        title="V plans"
        apps={["vibot", "verve", "velth", "vmem", "vhub"]}
        headline={V_PRO_COPY.headline}
        finePrint={V_PRO_COPY.finePrint}
        defaultBillingPeriod="year"
        renderCheckout={(button: ReactNode) => button}
        plans={[
          {
            id: "free",
            name: free.name,
            price: free.price,
            current: true,
            benefits: free.benefits.map((label) => ({ label })),
          },
          {
            id: "pro",
            name: pro.name,
            price: pro.price,
            featured: true,
            ctaLabel: pro.ctaLabel,
            intro: pro.intro,
            benefits: pro.benefits.map((label) => ({ label })),
          },
        ]}
      />
    </TooltipProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Preview />);
