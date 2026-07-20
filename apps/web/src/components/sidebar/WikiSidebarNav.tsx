import { useCallback, useMemo } from "react";
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
import { useIdSelectionMode } from "@/hooks/useIdSelectionMode";
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
  const createNode = useMutation(api.wiki.createNode);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const {
    selectionMode,
    selectedIds,
    setSelectionMode,
    exitSelection,
    toggleSelect,
  } = useIdSelectionMode<Id<"wikiNodes">>();

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
    (kind: "folder" | "document" | "artifact") => {
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
    },
    [createNode, navigate, profileId, teamId],
  );

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
