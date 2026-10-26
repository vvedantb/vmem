import { hasVPlan, V_PRO_PLAN_KEYS } from "@vvedantb/server";

// Clerk Billing item statuses that grant the plan. `canceled` still grants
// until the paid period ends (`ended` / `expired` remove it). The Convex JWT
// template has no `pla` claim, so Convex reads `users.planSlugs` from webhooks.
const GRANTING_ITEM_STATUSES: readonly string[] = [
  "active",
  "past_due",
  "canceled",
];

export type PlanItem = {
  status: string;
  plan?: { slug: string } | null;
};

type Env = Record<string, string | undefined>;

// Convex env `V_PRO_COMP_USER_IDS`: comma-separated Clerk user ids that get V
// Pro without a paid plan. Empty or unset means nobody.
export function parseVProCompUserIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isVProCompUser(
  clerkId: string,
  env: Env = process.env,
): boolean {
  return parseVProCompUserIds(env.V_PRO_COMP_USER_IDS).includes(clerkId);
}

// The single V Pro check: a paid plan slug or the complimentary allowlist.
export function userHasVPlan(
  user: { clerkId?: string; planSlugs?: readonly string[] } | null,
  env: Env = process.env,
): boolean {
  if (!user) return false;
  if ((user.planSlugs ?? []).some((slug) => V_PRO_PLAN_KEYS.includes(slug))) {
    return true;
  }
  return user.clerkId !== undefined && isVProCompUser(user.clerkId, env);
}

// For when the JWT template gains a `pla` claim.
export function identityHasVPlan(identity: object | null): boolean {
  return identity !== null && hasVPlan(identity);
}

export function itemGrantsPlan(item: PlanItem): boolean {
  return GRANTING_ITEM_STATUSES.includes(item.status);
}

// Full set from a subscription event, which lists every item. Sorted and unique.
export function planSlugsFromItems(items: readonly PlanItem[]): string[] {
  const slugs = new Set<string>();
  for (const item of items) {
    if (item.plan && itemGrantsPlan(item)) slugs.add(item.plan.slug);
  }
  return [...slugs].sort();
}

// One subscriptionItem event holds one item, so merge it into the stored set.
export function applyItemToPlanSlugs(
  current: readonly string[],
  item: PlanItem,
): string[] {
  if (!item.plan) return [...current];
  const slugs = new Set(current);
  if (itemGrantsPlan(item)) slugs.add(item.plan.slug);
  else slugs.delete(item.plan.slug);
  return [...slugs].sort();
}
