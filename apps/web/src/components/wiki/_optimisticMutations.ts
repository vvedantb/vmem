import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { collectSubtreeIds } from "./_utils";

type RenameArgs = FunctionArgs<typeof api.wiki.renameNode>;
type DeleteArgs = FunctionArgs<typeof api.wiki.deleteNode>;
type MoveArgs = FunctionArgs<typeof api.wiki.moveNode>;
type UpdateContentArgs = FunctionArgs<typeof api.wiki.updateContent>;

export function optimisticRenameWikiNode(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: RenameArgs,
): void {
  const tree = localStore.getQuery(api.wiki.listTree, { teamId });
  if (tree) {
    localStore.setQuery(
      api.wiki.listTree,
      { teamId },
      tree.map((node) =>
        node._id === args.id
          ? { ...node, title: args.title, updatedAt: Date.now() }
          : node,
      ),
    );
  }
  const node = localStore.getQuery(api.wiki.getNode, { id: args.id });
  if (node) {
    localStore.setQuery(
      api.wiki.getNode,
      { id: args.id },
      { ...node, title: args.title, updatedAt: Date.now() },
    );
  }
}

export function optimisticDeleteWikiNode(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: DeleteArgs,
): void {
  const tree = localStore.getQuery(api.wiki.listTree, { teamId });
  if (!tree) return;
  const remove = collectSubtreeIds(tree, [args.id]);
  localStore.setQuery(
    api.wiki.listTree,
    { teamId },
    tree.filter((node) => !remove.has(node._id)),
  );
  const open = localStore.getQuery(api.wiki.getNode, { id: args.id });
  if (open) {
    localStore.setQuery(api.wiki.getNode, { id: args.id }, null);
  }
}

export function optimisticMoveWikiNode(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: MoveArgs,
): void {
  const tree = localStore.getQuery(api.wiki.listTree, { teamId });
  if (!tree) return;
  localStore.setQuery(
    api.wiki.listTree,
    { teamId },
    tree.map((node) =>
      node._id === args.id
        ? {
            ...node,
            parentId: args.newParentId,
            order: args.newOrder,
            updatedAt: Date.now(),
          }
        : node,
    ),
  );
}

export function optimisticUpdateWikiContent(
  localStore: OptimisticLocalStore,
  args: UpdateContentArgs,
): void {
  const node = localStore.getQuery(api.wiki.getNode, { id: args.id });
  if (!node) return;
  localStore.setQuery(
    api.wiki.getNode,
    { id: args.id },
    {
      ...node,
      content: args.content,
      contentText: args.contentText,
      updatedAt: Date.now(),
    },
  );
}
