import { useAuth } from "@clerk/clerk-react";
import { api } from "@vmem/backend";
import { useQuery } from "convex/react";
import {
  hasVPlan,
  V_PRO_LEGACY_PLAN_KEY,
  V_PRO_PLAN_KEY,
} from "@vvedantb/server";
import { FREE_MEMORY_LIMIT } from "@vmem/shared";

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
    `Unlimited memories (Free is capped at ${String(FREE_MEMORY_LIMIT)})`,
    "One subscription for vibot, Verve, Velth, vmem and vhub",
    "Shared Pro across every V app on the same Clerk account",
    "Manage billing once, in your account",
    "Monthly or yearly billing",
    "Cancel anytime",
  ],
};
// True when the user holds V Pro. The server query wins: it covers paid plans
// and the complimentary allowlist. The session checks cover paid users while
// the query loads. Free is capped at FREE_MEMORY_LIMIT memories (enforced in
// Convex). V Pro has no cap. This hook drives the account menu and upgrade
// prompts.
export function useHasVPlan(): boolean {
  const { has, sessionClaims } = useAuth();
  const serverPro = useQuery(api.users.hasVPlan);
  return (
    serverPro === true ||
    Boolean(has?.({ plan: V_PRO_PLAN_KEY })) ||
    Boolean(has?.({ plan: V_PRO_LEGACY_PLAN_KEY })) ||
    hasVPlan(sessionClaims)
  );
}
