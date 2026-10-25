// @vitest-environment happy-dom
// Pins the V Pro pricing copy and the Clerk checkout props for each period.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, resetDocument, type Mounted } from "@/test/dom";

const checkout = vi.hoisted(() => ({
  props: [] as Array<{ planId: string; planPeriod: string }>,
}));

vi.mock("@clerk/clerk-react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@clerk/clerk-react/experimental", () => ({
  CheckoutButton: (props: {
    planId: string;
    planPeriod: string;
    children: ReactNode;
  }) => {
    checkout.props.push({ planId: props.planId, planPeriod: props.planPeriod });
    return <>{props.children}</>;
  },
}));

const { VProPricingModal } = await import("./VProPricingModal");

let mounted: Mounted | null = null;

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  resetDocument();
  checkout.props = [];
});

describe("VProPricingModal", () => {
  it("renders the shared plan copy with yearly selected", async () => {
    mounted = await mount(<VProPricingModal open onClose={vi.fn()} />);
    const text = document.querySelector("[role='dialog']")?.textContent ?? "";
    expect(text).toContain("$10");
    expect(text).toContain("$120");
    expect(text).toContain("Save 33%");
    expect(text).toContain("vibot, Verve, Velth, vmem and vhub");
    expect(checkout.props.at(-1)).toEqual({
      planId: "cplan_3LCYu8VRMwyb4BnmxzbFMomCa5R",
      planPeriod: "annual",
    });
  });

  it("renders nothing when closed", async () => {
    mounted = await mount(<VProPricingModal open={false} onClose={vi.fn()} />);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
