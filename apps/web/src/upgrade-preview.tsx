// Dev-only screenshot harness. Open /upgrade-preview.html with `pnpm dev`.
// Not in the Vite build input, so `vite build` never emits it.
import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  IconVmem,
  PricingModal,
  RailTile,
  SidebarUpgradeCard,
  TooltipProvider,
} from "@vvedantb/ui";
import { V_PRO_COPY } from "@/lib/vPlan";
import "./globals.css";

const { free, pro } = V_PRO_COPY;

function Preview() {
  const [isDark, setIsDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [period, setPeriod] = useState<"month" | "year">("year");

  if (isDark) document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="flex items-center gap-3 border-b border-separator px-4 py-3">
          <IconVmem size={26} className="text-foreground" />
          <span className="text-lg font-semibold leading-none">vmem</span>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="toggle-theme"
              onClick={() => setIsDark((v) => !v)}
            >
              {isDark ? "Light" : "Dark"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="toggle-collapse"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? "Expand" : "Collapse"}
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="open-pricing"
              onClick={() => setPricingOpen(true)}
            >
              Open pricing
            </Button>
          </div>
        </div>

        <div className="flex min-h-[36rem] gap-8 p-8">
          {collapsed ? (
            <div
              className="flex flex-col items-center gap-2 border border-separator py-3"
              style={{ width: "var(--vmem-sidebar-rail-width)" }}
              data-testid="collapsed-rail"
            >
              <RailTile label="Home" active>
                <IconVmem size={26} className="text-current" />
              </RailTile>
              <div className="mt-auto flex flex-col items-center gap-2">
                <SidebarUpgradeCard
                  collapsed
                  onUpgrade={() => setPricingOpen(true)}
                />
                <span className="text-xs">A</span>
              </div>
            </div>
          ) : (
            <div
              className="flex border border-separator"
              style={{ width: "var(--vmem-sidebar-width)" }}
              data-testid="expanded-sidebar"
            >
              <div
                className="flex shrink-0 flex-col items-center border-r border-separator py-3"
                style={{ width: "var(--vmem-sidebar-rail-width)" }}
              >
                <RailTile label="Home" active>
                  <IconVmem size={26} className="text-current" />
                </RailTile>
                <span className="mt-auto pb-2 text-xs">A</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="px-2 pt-3 text-sm font-medium">Memories</div>
                <div className="mt-auto space-y-3 pb-3 pt-3">
                  <SidebarUpgradeCard onUpgrade={() => setPricingOpen(true)} />
                </div>
              </div>
            </div>
          )}
          <main className="text-sm text-muted">Dev preview only.</main>
        </div>

        <PricingModal
          open={pricingOpen}
          onClose={() => setPricingOpen(false)}
          title="V plans"
          currentApp="vmem"
          apps={["vibot", "verve", "velth", "vmem", "vhub"]}
          headline={V_PRO_COPY.headline}
          finePrint={V_PRO_COPY.finePrint}
          billingPeriod={period}
          onBillingPeriodChange={setPeriod}
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
            },
          ]}
        />
      </div>
    </TooltipProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Preview />);
