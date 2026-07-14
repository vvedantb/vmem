import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@vmem/backend";
import { optimisticId } from "@/lib/optimisticId";
import type { WikiListNode } from "./-types";

type CreateNodeArgs = FunctionArgs<typeof api.wiki.createNode>;

export function optimisticCreateWikiNode(
  localStore: OptimisticLocalStore,
  args: CreateNodeArgs,
): void {
  const tree = localStore.getQuery(api.wiki.listTree, {
    teamId: args.teamId,
  });
  if (!tree || tree.length === 0) return;
  const head = tree.at(0);
  if (!head) return;
  const siblings = tree.filter((n) => n.parentId === args.parentId);
  const nextOrder =
    siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;
  const now = Date.now();
  const row: WikiListNode = {
    _id: optimisticId("wikiNodes"),
    _creationTime: now,
    userId: head.userId,
    teamId: args.teamId,
    parentId: args.parentId,
    kind: args.kind,
    title: args.title,
    content:
      args.kind === "document" || args.kind === "artifact" ? "" : undefined,
    contentText:
      args.kind === "document" || args.kind === "artifact" ? "" : undefined,
    language: args.kind === "artifact" ? (args.language ?? "html") : undefined,
    order: nextOrder,
    createdAt: now,
    updatedAt: now,
  };
  localStore.setQuery(api.wiki.listTree, { teamId: args.teamId }, [
    ...tree,
    row,
  ]);
}
