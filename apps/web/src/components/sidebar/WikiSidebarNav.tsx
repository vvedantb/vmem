"use client";

import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconBook } from "@tabler/icons-react";
import WikiTree from "@/components/wiki/WikiTree";
import WikiSearch from "@/components/wiki/WikiSearch";
import { WikiAddMenu } from "@/components/wiki/WikiAddMenu";
import { buildTree, findFirstDocumentId } from "@/components/wiki/_utils";
import { optimisticId } from "@/lib/optimisticId";

export type WikiSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

export function WikiSidebarNav({ isIconOnly, isMobile }: WikiSidebarNavProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const docId =
    typeof params.docId === "string" && params.docId.length > 0
      ? params.docId
      : null;

  const nodes = useQuery(api.wiki.listTree);
  const createNode = useMutation(api.wiki.createNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, {});
      if (!tree || tree.length === 0) return;
      const siblings = tree.filter((n) => n.parentId === args.parentId);
      const nextOrder =
        siblings.length === 0
          ? 0
          : Math.max(...siblings.map((s) => s.order)) + 1;
      const now = Date.now();
      const tempId = optimisticId("wikiNodes");
      const row: Doc<"wikiNodes"> = {
        _id: tempId,
        _creationTime: now,
        userId: tree[0].userId,
        parentId: args.parentId,
        kind: args.kind,
        title: args.title,
        content: args.kind === "document" ? "" : undefined,
        contentText: args.kind === "document" ? "" : undefined,
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
      };
      localStore.setQuery(api.wiki.listTree, {}, [...tree, row]);
    },
  );

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const handleSelectNode = useCallback(
    (id: string) => {
      if (id.length > 0) {
        void navigate({ to: "/wiki/$docId", params: { docId: id } });
        return;
      }
      const firstId = findFirstDocumentId(tree);
      if (firstId !== null) {
        void navigate({
          to: "/wiki/$docId",
          params: { docId: firstId },
          replace: true,
        });
      }
    },
    [navigate, tree],
  );

  const handleCreateRoot = useCallback(
    (kind: "folder" | "document") => {
      void (async () => {
        const title = kind === "folder" ? "Untitled folder" : "Untitled";
        const newId = await createNode({ parentId: undefined, kind, title });
        if (kind === "document") {
          void navigate({ to: "/wiki/$docId", params: { docId: newId } });
        }
      })();
    },
    [createNode, navigate],
  );

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1">
        {nodes === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <IconBook size={28} className="mb-2 text-muted-foreground" />
            {!isIconOnly ? (
              <p className="text-xs text-muted-foreground">No documents yet</p>
            ) : null}
          </div>
        ) : (
          <>
            {!isIconOnly ? <WikiSearch onSelect={handleSelectNode} /> : null}
            <WikiTree
              tree={tree}
              selectedId={docId}
              onSelect={handleSelectNode}
            />
          </>
        )}
      </div>

      {!isIconOnly ? (
        <div className="shrink-0 px-1 pt-2">
          <WikiAddMenu
            className="w-full gap-2"
            onCreateDocument={() => handleCreateRoot("document")}
            onCreateFolder={() => handleCreateRoot("folder")}
          />
        </div>
      ) : null}
    </motion.nav>
  );
}
