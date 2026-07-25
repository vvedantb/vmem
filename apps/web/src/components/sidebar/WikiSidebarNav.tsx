import { useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBook, IconListCheck } from "@tabler/icons-react";
import WikiTree from "@/components/wiki/WikiTree";
import WikiSearch from "@/components/wiki/WikiSearch";
import { WikiAddMenu } from "@/components/wiki/WikiAddMenu";
import { WikiBulkDeleteBar } from "@/components/wiki/WikiBulkDeleteBar";
import { buildTree, findFirstDocumentId } from "@/components/wiki/_utils";
import { useIdSelection } from "@/hooks/useIdSelection";
import {
  useActiveProfileId,
  useActiveTeamId,
} from "@/components/workspace/active-profile";
import { SubSidebarShell } from "./SubSidebarShell";

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
      const tempId = crypto.randomUUID() as Id<"wikiNodes">;
      localStore.setQuery(api.wiki.listTree, listArgs, [
        ...list,
        {
          _id: tempId,
          _creationTime: now,
          userId: list[0]?.userId ?? ("" as Id<"users">),
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

  const tree = nodes ? buildTree(nodes) : [];

  const {
    selectionMode,
    selectedIds,
    setSelectionMode,
    exitSelection,
    toggleSelect,
  } = useIdSelection<Id<"wikiNodes">>();

  const handleSelectNode = (id: string) => {
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
  };

  const handleCreateRoot = (kind: "folder" | "document" | "artifact") => {
    void (async () => {
      const title =
        kind === "folder"
          ? "Untitled folder"
          : kind === "artifact"
            ? "Untitled artifact"
            : "Untitled";
      const newId = await createNode({
        parentId: undefined,
        kind,
        title,
        teamId,
        language: kind === "artifact" ? "html" : undefined,
      });
      if (
        (kind === "document" || kind === "artifact") &&
        profileId !== undefined
      ) {
        void navigate({
          to: "/$profileId/wiki/$docId",
          params: { profileId, docId: newId },
        });
      }
    })();
  };

  const toolbarAddMenu = (
    <WikiAddMenu
      variant="toolbar"
      onCreateDocument={() => handleCreateRoot("document")}
      onCreateArtifact={() => handleCreateRoot("artifact")}
      onCreateFolder={() => handleCreateRoot("folder")}
    />
  );

  const labeledAddMenu = (
    <WikiAddMenu
      variant="labeled"
      className="w-full"
      onCreateDocument={() => handleCreateRoot("document")}
      onCreateArtifact={() => handleCreateRoot("artifact")}
      onCreateFolder={() => handleCreateRoot("folder")}
    />
  );

  const selectButton = (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="Select"
      className="shrink-0"
      onClick={() => setSelectionMode(true)}
    >
      <IconListCheck size={16} />
    </Button>
  );

  return (
    <SubSidebarShell isMobile={isMobile}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1">
        {nodes === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <>
            {!isIconOnly ? labeledAddMenu : null}
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
              <WikiSearch
                onSelect={handleSelectNode}
                className="shrink-0"
                actions={
                  <>
                    {toolbarAddMenu}
                    {selectButton}
                  </>
                }
              />
            ) : null}
            {!isIconOnly && selectionMode ? (
              <WikiBulkDeleteBar
                selectedIds={selectedIds}
                nodes={nodes ?? []}
                currentDocId={docId}
                onExit={exitSelection}
                onCurrentRemoved={() => handleSelectNode("")}
              />
            ) : null}
            <WikiTree
              nodes={nodes ?? []}
              selectedId={docId}
              onSelect={handleSelectNode}
              mode={selectionMode && !isIconOnly ? "bulk-select" : "navigate"}
              selectedNodeIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </>
        )}
      </div>
    </SubSidebarShell>
  );
}
