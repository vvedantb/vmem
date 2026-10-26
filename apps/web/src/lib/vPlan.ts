import { useAuth } from "@clerk/clerk-react";
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
  headline: "One plan. Every V app.",
  finePrint: "Cancel anytime. $120 billed yearly. Save 33%.",
  free: {
    name: "Free",
    price: { month: "$0", year: "$0" },
    benefits: [
      `${String(FREE_MEMORY_LIMIT)} memories`,
      "Universal memory graph (list, graph, timeline)",
      "MCP and HTTP API access",
      "Connectors: Drive, Gmail, Notion, Figma, GitHub",
      "Skills, Dream Mode and teams",
      "Files up to 10 GiB",
    ],
  },
  pro: {
    name: "V Pro",
    price: { month: "$15", year: "$10" },
    ctaLabel: "Upgrade",
    intro: "Everything in Free, and:",
  },
};

// True when the session says the user holds V Pro (current or legacy key).
// The session token claims are a fallback for when `has` is not ready.
// Free is capped at FREE_MEMORY_LIMIT memories (enforced in Convex). V Pro has
// no cap. This hook drives the upgrade UI.
export function useHasVPlan(): boolean {
  const { has, sessionClaims } = useAuth();
  return (
    Boolean(has?.({ plan: V_PRO_PLAN_KEY })) ||
    Boolean(has?.({ plan: V_PRO_LEGACY_PLAN_KEY })) ||
    hasVPlan(sessionClaims)
  );
}
