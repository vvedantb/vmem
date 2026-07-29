import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { tempId } from "@/lib/convex-optimistic";

// default title shown before the user renames a freshly created node
export function defaultWikiNodeTitle(
  kind: "folder" | "document" | "artifact",
): string {
  return kind === "folder"
    ? "Untitled folder"
    : kind === "artifact"
      ? "Untitled artifact"
      : "Untitled";
}

// createNode mutation with an optimistic insert into the cached listTree query
export function useCreateWikiNode() {
  return useMutation(api.wiki.createNode).withOptimisticUpdate(
    (localStore, args) => {
      const listArgs = { teamId: args.teamId };
      const list = localStore.getQuery(api.wiki.listTree, listArgs);
      if (list === undefined) return;
      const now = Date.now();
      const siblings = list.filter(
        (n) => (n.parentId ?? undefined) === (args.parentId ?? undefined),
      );
      const order =
        siblings.length === 0
          ? 0
          : Math.max(...siblings.map((s) => s.order)) + 1;
      const newId = tempId<"wikiNodes">();
      localStore.setQuery(api.wiki.listTree, listArgs, [
        ...list,
        {
          _id: newId,
          _creationTime: now,
          userId: list[0]?.userId ?? tempId<"users">(),
          teamId: args.teamId,
          parentId: args.parentId,
          kind: args.kind,
          title: args.title,
          language: args.language,
          order,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
  );
}
