"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { Dialog, DialogContent, DialogTitle } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";
import { buildTree, findAncestors, findFirstDocumentId } from "./_utils";
import type { OutlineHeading } from "./_utils";
import WikiEditor from "./WikiEditor";
import WikiOutline from "./WikiOutline";
import { useWikiSidebar } from "./WikiSidebarContext";
import { WikiPageBreadcrumb } from "./WikiPageBreadcrumb";
import { WikiDocActionsMenu } from "./WikiDocActionsMenu";

interface WikiWorkspaceProps {
  docId: string | null;
}

/**
 * Wiki editor shell. Document tree and Add live in the root sidebar.
 * Page header: breadcrumb + inline title; outline toggle and actions grouped on the right.
 */
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const teamId = activeProfile.teamId;
  const nodes = useQuery(api.wiki.listTree, { teamId });
  const doc = useQuery(api.wiki.getNode, docId ? { id: docId } : "skip");
  const renameNode = useMutation(api.wiki.renameNode).withOptimisticUpdate(
    (localStore, args) => {
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
    },
  );
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
  const hasDocId = docId !== null && docId.length > 0;
  const isDocLoading = hasDocId && doc === undefined;
  const hasDoc =
    hasDocId && doc !== null && doc !== undefined && doc.kind === "document";
  const ancestors = doc && nodes ? findAncestors(doc, nodes) : [];
  const pageTitle = hasDoc && doc ? titleDraft || doc.title : "Wiki";

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
    if (!hasDocId) {
      setOutlineVisible(false);
      setWordCount(0);
      setTitleDraft("");
    }
  }, [hasDoc, hasDocId, setHasDoc, setOutlineVisible, setWordCount]);

  useEffect(() => {
    if (doc?.kind === "document") {
      setTitleDraft(doc.title);
    }
  }, [doc?._id, doc?.title, doc?.kind]);

  // Only when `/wiki` has no doc id — not while a selected doc is loading.
  useEffect(() => {
    if (!nodes || hasDocId) return;
    const firstId = findFirstDocumentId(tree);
    if (firstId !== null) {
      void navigate({
        to: "/$profileId/wiki/$docId",
        params: { profileId: activeProfile._id, docId: firstId },
        replace: true,
      });
    }
  }, [hasDocId, nodes, tree, navigate, activeProfile._id]);

  // URL points at a folder (not a document) — open first document instead.
  useEffect(() => {
    if (!hasDocId || !nodes || doc === undefined) return;
    if (doc === null || doc.kind === "document") return;
    const firstId = findFirstDocumentId(tree);
    if (firstId !== null && firstId !== docId) {
      void navigate({
        to: "/$profileId/wiki/$docId",
        params: { profileId: activeProfile._id, docId: firstId },
        replace: true,
      });
    }
  }, [hasDocId, docId, doc, nodes, tree, navigate, activeProfile._id]);

  return (
    <PageContainer
      title={pageTitle}
      noScroll
      breadcrumb={
        hasDoc || isDocLoading ? (
          <WikiPageBreadcrumb
            ancestors={ancestors}
            title={titleDraft}
            onTitleChange={setTitleDraft}
            onTitleCommit={() => void handleTitleCommit()}
          />
        ) : undefined
      }
      rightSection={
        hasDoc || isDocLoading ? (
          <WikiDocActionsMenu
            outlineVisible={outlineVisible}
            onOutlineVisibleChange={setOutlineVisible}
            wordCount={wordCount}
            onCopy={handleCopy}
            copyDisabled={!copyReady}
          />
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {hasDoc || isDocLoading ? (
          <div className="flex min-h-0 min-w-0 flex-1 gap-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

            {outlineVisible && !isMobileViewport && hasDoc ? (
              <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto rounded-lg bg-surface-secondary/40 p-2 scrollbar-thin md:block">
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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm text-muted">
              No documents yet. Use Add in the sidebar to create one.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">
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
