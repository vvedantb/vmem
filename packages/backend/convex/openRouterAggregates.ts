import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// namespace keys: personal `u:${userId}`, team `t:${teamId}`
type OwnerNamespace = string;

export const openRouterCost = new DirectAggregate<{
  Key: number;
  Id: string;
  Namespace: OwnerNamespace;
}>(components.openRouterLogCost);

export const openRouterTokens = new DirectAggregate<{
  Key: number;
  Id: string;
  Namespace: OwnerNamespace;
}>(components.openRouterLogTokens);

export const openRouterModels = new DirectAggregate<{
  Key: string;
  Id: string;
  Namespace: OwnerNamespace;
}>(components.openRouterModels);

export function userLogNamespace(userId: Id<"users">): OwnerNamespace {
  return `u:${userId}`;
}

export function teamLogNamespace(teamId: Id<"teams">): OwnerNamespace {
  return `t:${teamId}`;
}

async function insertOwnerAggregates(
  ctx: MutationCtx,
  doc: Doc<"openRouterLogs">,
  namespace: OwnerNamespace,
) {
  const id = doc._id;
  const key = doc.createdAt;
  await openRouterCost.insert(ctx, {
    namespace,
    key,
    id,
    sumValue: doc.costUsd ?? 0,
  });
  await openRouterTokens.insert(ctx, {
    namespace,
    key,
    id,
    sumValue: doc.totalTokens ?? 0,
  });
  await openRouterModels.insertIfDoesNotExist(ctx, {
    namespace,
    key: doc.model,
    id: doc.model,
  });
}

// keep aggregates in sync when a log row is inserted
export async function insertOpenRouterLogAggregates(
  ctx: MutationCtx,
  doc: Doc<"openRouterLogs">,
) {
  await insertOwnerAggregates(ctx, doc, userLogNamespace(doc.userId));
  if (doc.teamId !== undefined) {
    await insertOwnerAggregates(ctx, doc, teamLogNamespace(doc.teamId));
  }
}
