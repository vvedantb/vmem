"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
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
import WikiTree from "./WikiTree";
import WikiEditor from "./WikiEditor";
import WikiOutline from "./WikiOutline";
import WikiSearch from "./WikiSearch";

interface WikiWorkspaceProps {
  docId: string | null;
}

/**
 * Three-pane shell for /wiki. Tree on the left, editor center, outline right.
 * Selected document id lives in `/wiki/:docId` path param.
 *
 * Visiting `/wiki` redirects to the first document when one exists.
 * Layout mirrors skills: plain list column, document pane on muted surface.
 */
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
  const navigate = useNavigate();
  const nodes = useQuery(api.wiki.listTree);
  const createNode = useMutation(api.wiki.createNode);

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });
  const [isOutlineVisible, setIsOutlineVisible] = useState(false);
  const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);
  const [mobileShowList, setMobileShowList] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const handleSelectNode = useCallback(
    (id: string) => {
      if (id.length > 0) {
        setMobileShowList(false);
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
    async (kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId: undefined, kind, title });
      if (kind === "document") {
        handleSelectNode(newId);
      }
    },
    [createNode, handleSelectNode],
  );

  const handleJumpToHeading = (pos: number) => {
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
    setIsMobileOutlineOpen(false);
  };

  const hasDoc = docId !== null && docId.length > 0;
  const showMobileEditor = hasDoc && !mobileShowList;

  useEffect(() => {
    if (!hasDoc) {
      setIsOutlineVisible(false);
      setWordCount(0);
      return;
    }
    setMobileShowList(false);
  }, [hasDoc, docId]);

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
      <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2 overflow-hidden md:w-1/3 md:shrink-0",
            showMobileEditor ? "hidden md:flex" : "flex flex-1 w-full",
          )}
        >
          <WikiSearch onSelect={handleSelectNode} />
          <div className="flex min-h-0 flex-1">
            <WikiTree
              tree={tree}
              selectedId={docId}
              onSelect={handleSelectNode}
              outlineVisible={isOutlineVisible}
              onOutlineVisibleChange={setIsOutlineVisible}
              hasDoc={hasDoc}
              wordCount={wordCount}
            />
          </div>
        </div>

        {hasDoc ? (
          <div
            className={cn(
              "flex min-h-0 min-w-0 gap-4",
              showMobileEditor
                ? "flex flex-1 w-full"
                : "hidden md:flex md:flex-1",
            )}
          >
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                "md:rounded-xl md:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between gap-2 p-2 md:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileShowList(true)}
                  aria-label="Back to documents"
                  className="gap-1.5"
                >
                  <IconArrowLeft size={16} />
                  Docs
                </Button>
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

            {isOutlineVisible ? (
              <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto scrollbar-thin md:block">
                <WikiOutline
                  headings={headings}
                  onJump={handleJumpToHeading}
                  hasDoc={hasDoc}
                />
              </div>
            ) : null}
          </div>
        ) : null}
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
