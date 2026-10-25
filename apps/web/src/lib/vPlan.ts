import { useAuth } from "@clerk/clerk-react";
import {
  hasVPlan,
  V_PRO_LEGACY_PLAN_KEY,
  V_PRO_PLAN_KEY,
} from "@vvedantb/server";

// V Pro is one Clerk Billing plan shared by vibot, Verve, Velth, vmem and vhub.
// Staging uses the same Project V Clerk Billing plan, so one id covers both.
export const V_PRO_CLERK_PLAN_ID = "cplan_3LCYu8VRMwyb4BnmxzbFMomCa5R";

export const V_PRO_COPY = {
  title: "V Pro",
  description: "One Pro plan for all V apps",
  tagline: "One plan for vibot, Verve, Velth, vmem and vhub.",
  pricePerMonth: "$15",
  yearly: { pricePerMonth: "$10", total: "$120", saveLabel: "Save 33%" },
  features: [
    "One subscription for vibot, Verve, Velth, vmem and vhub",
    "Shared Pro across every V app on the same Clerk account",
    "Manage billing once, in your account",
    "Monthly or yearly billing",
    "Cancel anytime",
  ],
};
// True when the session says the user holds V Pro (current or legacy key).
// The session token claims are a fallback for when `has` is not ready.
// Nothing in vmem is gated on this yet, so it only drives the account menu.
export function useHasVPlan(): boolean {
  const { has, sessionClaims } = useAuth();
  return (
    Boolean(has?.({ plan: V_PRO_PLAN_KEY })) ||
    Boolean(has?.({ plan: V_PRO_LEGACY_PLAN_KEY })) ||
    hasVPlan(sessionClaims)
  );
}
