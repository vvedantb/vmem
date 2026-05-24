"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { cn, Dialog, DialogContent, DialogTitle } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";
import { buildTree, findAncestors, findFirstDocumentId } from "./_utils";
import type { OutlineHeading } from "./_utils";
import WikiEditor from "./WikiEditor";
import WikiOutline from "./WikiOutline";
import { useWikiSidebar } from "./WikiSidebarContext";
import { WikiPageBreadcrumb } from "./WikiPageBreadcrumb";
import { WikiOutlineHeaderControls } from "./WikiOutlineHeaderControls";
import { WikiDocActionsMenu } from "./WikiDocActionsMenu";

interface WikiWorkspaceProps {
  docId: string | null;
}

/**
 * Wiki editor shell. Document tree and Add live in the root sidebar.
 * Page header: breadcrumb + inline title, outline toggle, word count, actions.
 */
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
  const navigate = useNavigate();
  const nodes = useQuery(api.wiki.listTree);
  const doc = useQuery(api.wiki.getNode, docId ? { id: docId } : "skip");
  const renameNode = useMutation(api.wiki.renameNode);
  const {
    outlineVisible,
    setOutlineVisible,
    wordCount,
    setWordCount,
    setHasDoc,
  } = useWikiSidebar();

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });
  const [titleDraft, setTitleDraft] = useState("");
  const [copyReady, setCopyReady] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const copyDocumentRef = useRef<(() => Promise<void>) | null>(null);

  const tree = nodes ? buildTree(nodes) : [];
  const hasDoc =
    docId !== null &&
    docId.length > 0 &&
    doc !== undefined &&
    doc !== null &&
    doc.kind === "document";
  const ancestors = doc && nodes ? findAncestors(doc, nodes) : [];
  const pageTitle = hasDoc ? titleDraft || doc.title : "Wiki";

  const handleJumpToHeading = (pos: number) => {
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
  };

  const handleTitleCommit = useCallback(async () => {
    if (!doc || doc.kind !== "document") return;
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0 || trimmed === doc.title) {
      setTitleDraft(doc.title);
      return;
    }
    try {
      await renameNode({ id: doc._id, title: trimmed });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setTitleDraft(doc.title);
    }
  }, [doc, renameNode, titleDraft]);

  const handleCopy = useCallback(() => {
    void copyDocumentRef.current?.();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    setHasDoc(hasDoc);
    if (!hasDoc) {
      setOutlineVisible(false);
      setWordCount(0);
      setTitleDraft("");
    }
  }, [hasDoc, setHasDoc, setOutlineVisible, setWordCount]);

  useEffect(() => {
    if (doc?.kind === "document") {
      setTitleDraft(doc.title);
    }
  }, [doc?._id, doc?.title, doc?.kind]);

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
      title={pageTitle}
      noScroll
      breadcrumb={
        hasDoc ? (
          <WikiPageBreadcrumb
            ancestors={ancestors}
            title={titleDraft}
            onTitleChange={setTitleDraft}
            onTitleCommit={() => void handleTitleCommit()}
          />
        ) : undefined
      }
      centerSection={
        hasDoc ? (
          <WikiOutlineHeaderControls
            outlineVisible={outlineVisible}
            onOutlineVisibleChange={setOutlineVisible}
            hasDoc={hasDoc}
            wordCount={wordCount}
          />
        ) : undefined
      }
      rightSection={
        hasDoc ? (
          <WikiDocActionsMenu onCopy={handleCopy} disabled={!copyReady} />
        ) : undefined
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
              <WikiEditor
                docId={docId}
                titleForCopy={titleDraft}
                onRegisterCopy={(handler) => {
                  copyDocumentRef.current = handler;
                  setCopyReady(handler !== null);
                }}
                onHeadingsChange={setHeadings}
                onWordCountChange={setWordCount}
                jumpRequest={jumpRequest}
              />
            </div>

            {outlineVisible && !isMobileViewport ? (
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
              No documents yet. Use Add in the sidebar to create one.
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

      <Dialog
        open={outlineVisible && hasDoc && isMobileViewport}
        onOpenChange={(open) => {
          if (!open) setOutlineVisible(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
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
