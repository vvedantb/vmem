import { useAuth } from "@clerk/clerk-react";
import { api } from "@vmem/backend";
import { useQuery } from "convex/react";
import { hasVPlan, V_PRO_PLAN_KEY } from "@vvedantb/server";
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
    hasVPlan(sessionClaims)
  );
}
