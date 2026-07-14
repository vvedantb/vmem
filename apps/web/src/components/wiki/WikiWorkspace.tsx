"use client";

import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { api } from "@vmem/backend";
import { Dialog, DialogContent, DialogTitle } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";
import { buildTree, findAncestors } from "./_utils";
import type { OutlineHeading } from "./_utils";
import WikiOutline from "./WikiOutline";
import { useWikiSidebar } from "./WikiSidebarContext";
import { WikiPageBreadcrumb } from "./WikiPageBreadcrumb";
import { WikiDocActionsMenu } from "./WikiDocActionsMenu";

const WikiEditor = lazy(() => import("./WikiEditor"));
const WikiHistoryPanel = lazy(() =>
  import("./WikiHistoryPanel").then((m) => ({ default: m.WikiHistoryPanel })),
);

type WikiWorkspacePhase =
  | "loading-tree"
  | "empty"
  | "pick-doc"
  | "loading-doc"
  | "editing";

function resolvePhase(args: {
  hasDoc: boolean;
  isDocLoading: boolean;
  nodesUndefined: boolean;
  treeEmpty: boolean;
}): WikiWorkspacePhase {
  if (args.hasDoc) return "editing";
  if (args.isDocLoading) return "loading-doc";
  if (args.nodesUndefined) return "loading-tree";
  if (args.treeEmpty) return "empty";
  return "pick-doc";
}

function WikiSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
    </div>
  );
}

const wikiEmptyState = (
  <div className="flex flex-1 flex-col items-center justify-center text-center">
    <p className="text-sm text-muted">
      No documents yet. Use Add in the sidebar to create one.
    </p>
  </div>
);

const wikiPickDocState = (
  <div className="flex flex-1 items-center justify-center">
    <p className="text-sm text-muted">Select a document from the sidebar</p>
  </div>
);

function WikiWorkspaceEditing({
  outlineVisible,
  isMobileViewport,
  headings,
  activeHeadingId,
  onJump,
  docId,
  titleForCopy,
  onRegisterCopy,
  onRegisterRestore,
  onHeadingsChange,
  onActiveHeadingChange,
  onWordCountChange,
  jumpRequest,
  phase,
}: Omit<WikiWorkspaceBodyProps, "phase"> & {
  phase: "editing" | "loading-doc";
}) {
  const showOutline =
    phase === "editing" && outlineVisible && !isMobileViewport;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      {showOutline ? (
        <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto rounded-lg bg-surface-secondary/40 p-2 scrollbar-thin md:block">
          <WikiOutline
            headings={headings}
            activeHeadingId={activeHeadingId}
            onJump={onJump}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<WikiSpinner />}>
          <WikiEditor
            docId={docId}
            titleForCopy={titleForCopy}
            onRegisterCopy={onRegisterCopy}
            onRegisterRestore={onRegisterRestore}
            onHeadingsChange={onHeadingsChange}
            onActiveHeadingChange={onActiveHeadingChange}
            onWordCountChange={onWordCountChange}
            jumpRequest={jumpRequest}
          />
        </Suspense>
      </div>
    </div>
  );
}

interface WikiWorkspaceBodyProps {
  phase: WikiWorkspacePhase;
  outlineVisible: boolean;
  isMobileViewport: boolean;
  headings: OutlineHeading[];
  activeHeadingId: string | null;
  onJump: (pos: number) => void;
  docId: string | null;
  titleForCopy: string;
  onRegisterCopy: (handler: (() => Promise<void>) | null) => void;
  onRegisterRestore: (
    handler: ((markdown: string) => Promise<void>) | null,
  ) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onActiveHeadingChange: (id: string | null) => void;
  onWordCountChange: (count: number) => void;
  jumpRequest: { pos: number; n: number };
}

function WikiWorkspaceBody(props: WikiWorkspaceBodyProps) {
  if (props.phase === "loading-tree") {
    return <WikiSpinner />;
  }
  if (props.phase === "empty") {
    return wikiEmptyState;
  }
  if (props.phase === "pick-doc") {
    return wikiPickDocState;
  }
  const { phase, ...editingProps } = props;
  return <WikiWorkspaceEditing phase={phase} {...editingProps} />;
}

interface WikiWorkspaceProps {
  docId: string | null;
}

// wiki editor shell — redirects live in WikiDocRouteRedirect
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
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
    historyVisible,
    setHistoryVisible,
    wordCount,
    setWordCount,
    setHasDoc,
  } = useWikiSidebar();

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });
  const [copyReady, setCopyReady] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const copyDocumentRef = useRef<(() => Promise<void>) | null>(null);
  const restoreDocumentRef = useRef<
    ((markdown: string) => Promise<void>) | null
  >(null);

  const tree = nodes ? buildTree(nodes) : [];
  const hasDocId = docId !== null && docId.length > 0;
  const isDocLoading = hasDocId && doc === undefined;
  const hasDoc = hasDocId && doc != null && doc.kind === "document";
  const editableDoc = hasDoc ? doc : null;
  const phase = resolvePhase({
    hasDoc,
    isDocLoading,
    nodesUndefined: nodes === undefined,
    treeEmpty: tree.length === 0,
  });
  const showChrome = phase === "editing" || phase === "loading-doc";
  const ancestors = doc && nodes ? findAncestors(doc, nodes) : [];
  const pageTitle = editableDoc ? editableDoc.title || "Untitled" : "Wiki";

  function handleTitleChange(title: string) {
    if (!editableDoc) return;
    void renameNode({ id: editableDoc._id, title }).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    });
  }

  function handleTitleCommit() {
    if (!editableDoc) return;
    const trimmed = editableDoc.title.trim();
    if (trimmed.length === 0) {
      void renameNode({ id: editableDoc._id, title: "Untitled" }).catch(
        (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to save");
        },
      );
      return;
    }
    if (trimmed !== editableDoc.title) {
      void renameNode({ id: editableDoc._id, title: trimmed }).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      });
    }
  }

  function requestJump(pos: number) {
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
  }

  function handleRegisterCopy(handler: (() => Promise<void>) | null) {
    copyDocumentRef.current = handler;
    setCopyReady(handler !== null);
  }

  function handleRegisterRestore(
    handler: ((markdown: string) => Promise<void>) | null,
  ) {
    restoreDocumentRef.current = handler;
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    function updateViewport() {
      setIsMobileViewport(mediaQuery.matches);
    }
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    setHasDoc(hasDoc);
    if (hasDocId) return;
    setOutlineVisible(false);
    setHistoryVisible(false);
    setWordCount(0);
  }, [
    hasDoc,
    hasDocId,
    setHasDoc,
    setOutlineVisible,
    setHistoryVisible,
    setWordCount,
  ]);

  return (
    <PageContainer
      title={pageTitle}
      noScroll
      breadcrumb={
        editableDoc ? (
          <WikiPageBreadcrumb
            ancestors={ancestors}
            doc={editableDoc}
            onTitleChange={handleTitleChange}
            onTitleCommit={handleTitleCommit}
          />
        ) : undefined
      }
      rightSection={
        showChrome ? (
          <WikiDocActionsMenu
            outlineVisible={outlineVisible}
            onOutlineVisibleChange={setOutlineVisible}
            onShowHistory={() => setHistoryVisible(true)}
            wordCount={wordCount}
            onCopy={() => void copyDocumentRef.current?.()}
            copyDisabled={!copyReady}
          />
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <WikiWorkspaceBody
          phase={phase}
          outlineVisible={outlineVisible}
          isMobileViewport={isMobileViewport}
          headings={headings}
          activeHeadingId={activeHeadingId}
          onJump={requestJump}
          docId={docId}
          titleForCopy={editableDoc?.title ?? ""}
          onRegisterCopy={handleRegisterCopy}
          onRegisterRestore={handleRegisterRestore}
          onHeadingsChange={setHeadings}
          onActiveHeadingChange={setActiveHeadingId}
          onWordCountChange={setWordCount}
          jumpRequest={jumpRequest}
        />
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
              activeHeadingId={activeHeadingId}
              onJump={requestJump}
            />
          </div>
        </DialogContent>
      </Dialog>

      {historyVisible ? (
        <Suspense fallback={null}>
          <WikiHistoryPanel
            open={historyVisible}
            onOpenChange={setHistoryVisible}
            docId={hasDoc && doc != null ? doc._id : null}
            onRestore={async (markdown) => {
              await restoreDocumentRef.current?.(markdown);
            }}
          />
        </Suspense>
      ) : null}
    </PageContainer>
  );
}
