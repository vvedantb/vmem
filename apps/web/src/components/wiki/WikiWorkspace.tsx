"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconChevronDown,
  IconFileText,
  IconFolderPlus,
  IconListDetails,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@vmem/ui";
import PageContainer from "@/components/PageContainer";
import { buildTree, findFirstDocumentId } from "./_utils";
import type { OutlineHeading } from "./_utils";
import WikiEditor from "./WikiEditor";
import WikiOutline from "./WikiOutline";
import { useWikiSidebar } from "./WikiSidebarContext";

interface WikiWorkspaceProps {
  docId: string | null;
}

/**
 * Wiki editor shell. Document tree lives in the root sidebar (like skills/settings).
 * Center pane: editor; optional outline column on the right.
 */
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
  const navigate = useNavigate();
  const nodes = useQuery(api.wiki.listTree);
  const createNode = useMutation(api.wiki.createNode);
  const { outlineVisible, setOutlineVisible, setWordCount, setHasDoc } =
    useWikiSidebar();

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });
  const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);

  const tree = nodes ? buildTree(nodes) : [];
  const hasDoc = docId !== null && docId.length > 0;

  const handleCreateRoot = useCallback(
    async (kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId: undefined, kind, title });
      if (kind === "document") {
        void navigate({ to: "/wiki/$docId", params: { docId: newId } });
      }
    },
    [createNode, navigate],
  );

  const handleJumpToHeading = (pos: number) => {
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
    setIsMobileOutlineOpen(false);
  };

  useEffect(() => {
    setHasDoc(hasDoc);
    if (!hasDoc) {
      setOutlineVisible(false);
      setWordCount(0);
    }
  }, [hasDoc, setHasDoc, setOutlineVisible, setWordCount]);

  useEffect(() => {
    if (hasDoc || !nodes) return;
    const firstId = findFirstDocumentId(tree);
    if (firstId !== null) {
      void navigate({
        to: "/wiki/$docId",
        params: { docId: firstId },
        replace: true,
      });
    }
  }, [hasDoc, nodes, tree, navigate]);

  useEffect(() => {
    if (!hasDoc || !nodes) return;
    const current = nodes.find((node) => node._id === docId);
    if (current?.kind === "document") return;
    const firstId = findFirstDocumentId(tree);
    if (firstId !== null && firstId !== docId) {
      void navigate({
        to: "/wiki/$docId",
        params: { docId: firstId },
        replace: true,
      });
    }
  }, [hasDoc, docId, nodes, tree, navigate]);

  return (
    <PageContainer
      title="Wiki"
      showTitle
      noScroll
      rightSection={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <IconPlus size={16} />
              Add
              <IconChevronDown size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => void handleCreateRoot("document")}
            >
              <IconFileText size={16} />
              New document
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleCreateRoot("folder")}>
              <IconFolderPlus size={16} />
              New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {hasDoc ? (
          <div className="flex min-h-0 min-w-0 flex-1 gap-4">
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted/40",
              )}
            >
              <div className="flex items-center justify-end gap-2 p-2 md:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileOutlineOpen(true)}
                  aria-label="Open outline"
                  className="gap-1.5"
                >
                  <IconListDetails size={16} />
                  View outline
                </Button>
              </div>
              <WikiEditor
                docId={docId}
                allNodes={nodes ?? []}
                onHeadingsChange={setHeadings}
                onWordCountChange={setWordCount}
                jumpRequest={jumpRequest}
              />
            </div>

            {outlineVisible ? (
              <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto scrollbar-thin md:block">
                <WikiOutline
                  headings={headings}
                  onJump={handleJumpToHeading}
                  hasDoc={hasDoc}
                />
              </div>
            ) : null}
          </div>
        ) : nodes === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              No documents yet. Use Add to create one.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Select a document from the sidebar
            </p>
          </div>
        )}
      </div>

      <Dialog open={isMobileOutlineOpen} onOpenChange={setIsMobileOutlineOpen}>
        <DialogContent className="md:hidden sm:max-w-sm">
          <DialogTitle className="sr-only">Outline</DialogTitle>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            <WikiOutline
              headings={headings}
              onJump={handleJumpToHeading}
              hasDoc={hasDoc}
            />
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
