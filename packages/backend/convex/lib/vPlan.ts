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

export function userHasVPlan(
  user: { planSlugs?: readonly string[] } | null,
): boolean {
  return (user?.planSlugs ?? []).some((slug) => V_PRO_PLAN_KEYS.includes(slug));
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
