"use client";

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import { IconBook } from "@tabler/icons-react";
import WikiTree from "@/components/wiki/WikiTree";
import WikiSearch from "@/components/wiki/WikiSearch";
import { WikiAddMenu } from "@/components/wiki/WikiAddMenu";
import { WikiBulkDeleteBar } from "@/components/wiki/WikiBulkDeleteBar";
import { buildTree, findFirstDocumentId } from "@/components/wiki/_utils";
import { optimisticId } from "@/lib/optimisticId";
import {
  useActiveProfileId,
  useActiveTeamId,
} from "@/components/workspace/active-profile";

export type WikiSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
};

export function WikiSidebarNav({ isIconOnly, isMobile }: WikiSidebarNavProps) {
  const navigate = useNavigate();
  const profileId = useActiveProfileId();
  const teamId = useActiveTeamId();
  const params = useParams({ strict: false });
  const docId =
    typeof params.docId === "string" && params.docId.length > 0
      ? params.docId
      : null;

  const nodes = useQuery(api.wiki.listTree, { teamId });
  const createNode = useMutation(api.wiki.createNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
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
        teamId,
        parentId: args.parentId,
        kind: args.kind,
        title: args.title,
        content: args.kind === "document" ? "" : undefined,
        contentText: args.kind === "document" ? "" : undefined,
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
      };
      localStore.setQuery(api.wiki.listTree, { teamId }, [...tree, row]);
    },
  );

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"wikiNodes">>>(
    () => new Set(),
  );

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: Id<"wikiNodes">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectNode = useCallback(
    (id: string) => {
      if (profileId === undefined) return;
      if (id.length > 0) {
        void navigate({
          to: "/$profileId/wiki/$docId",
          params: { profileId, docId: id },
        });
        return;
      }
      const firstId = findFirstDocumentId(tree);
      if (firstId !== null) {
        void navigate({
          to: "/$profileId/wiki/$docId",
          params: { profileId, docId: firstId },
          replace: true,
        });
      }
    },
    [navigate, tree, profileId],
  );

  const handleCreateRoot = useCallback(
    (kind: "folder" | "document") => {
      void (async () => {
        const title = kind === "folder" ? "Untitled folder" : "Untitled";
        const newId = await createNode({
          parentId: undefined,
          kind,
          title,
          teamId,
        });
        if (kind === "document" && profileId !== undefined) {
          void navigate({
            to: "/$profileId/wiki/$docId",
            params: { profileId, docId: newId },
          });
        }
      })();
    },
    [createNode, navigate, profileId],
  );

  // Grouped with the search at the top of the sidebar (shared by the empty and
  // populated states), replacing the old bottom-pinned button.
  const addMenu = (
    <WikiAddMenu
      className="w-full gap-2"
      onCreateDocument={() => handleCreateRoot("document")}
      onCreateFolder={() => handleCreateRoot("folder")}
    />
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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <>
            {!isIconOnly ? addMenu : null}
            <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
              <IconBook size={28} className="mb-2 text-muted" />
              {!isIconOnly ? (
                <p className="text-xs text-muted">No documents yet</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {!isIconOnly && !selectionMode ? (
              <div className="flex flex-col gap-2">
                <WikiSearch onSelect={handleSelectNode} />
                {addMenu}
              </div>
            ) : null}
            {!isIconOnly ? (
              selectionMode ? (
                <WikiBulkDeleteBar
                  selectedIds={selectedIds}
                  nodes={nodes ?? []}
                  teamId={teamId}
                  currentDocId={docId}
                  onExit={exitSelection}
                  onCurrentRemoved={() => handleSelectNode("")}
                />
              ) : (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted"
                    onClick={() => setSelectionMode(true)}
                  >
                    Select
                  </Button>
                </div>
              )
            ) : null}
            <WikiTree
              tree={tree}
              nodes={nodes ?? []}
              selectedId={docId}
              onSelect={handleSelectNode}
              selectionMode={selectionMode && !isIconOnly}
              selectedNodeIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </>
        )}
      </div>
    </motion.nav>
  );
}
