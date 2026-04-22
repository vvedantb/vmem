"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconArrowLeft,
  IconListDetails,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Button, Dialog, DialogContent, DialogTitle, cn } from "@vmem/ui";
import PageContainer from "@/components/PageContainer";
import { buildTree } from "./_utils";
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
 * Outline state is lifted here because the editor emits headings on update
 * but the outline pane needs them for rendering/jumping — keeping it here lets
 * the outline pane stay stateless and re-render whenever editor emits.
 *
 * On mobile (< md), the layout collapses to a single column. The tree fills
 * the screen when no document is selected; selecting a document swaps to the
 * editor view with a back button and an outline trigger that opens a dialog.
 */
export default function WikiWorkspace({ docId }: WikiWorkspaceProps) {
  const navigate = useNavigate();
  const nodes = useQuery(api.wiki.listTree);

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const gridCols = useMemo(() => {
    const left = isTreeCollapsed ? "40px" : "280px";
    const right = isOutlineCollapsed ? "40px" : "220px";
    return `${left} 1fr ${right}`;
  }, [isTreeCollapsed, isOutlineCollapsed]);

  const handleSelectNode = useCallback(
    (id: string) => {
      if (id.length > 0) {
        void navigate({ to: "/wiki/$docId", params: { docId: id } });
      } else {
        void navigate({ to: "/wiki" });
      }
    },
    [navigate],
  );

  const handleJumpToHeading = (pos: number) => {
    // Bump `n` so React treats each click as a new effect tick even if pos is identical.
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
    setIsMobileOutlineOpen(false);
  };

  const hasDoc = docId !== null && docId.length > 0;

  return (
    <PageContainer title="Wiki" noScroll>
      <div
        className="flex flex-col gap-2 h-full min-h-0 md:grid md:gap-4 md:transition-[grid-template-columns] md:duration-200"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Left pane: search + tree. Hidden on mobile when a doc is open. */}
        <div
          className={cn(
            "flex-col min-h-0 rounded-lg bg-muted/40 p-3 gap-3 flex-1 md:flex-initial md:flex",
            hasDoc ? "hidden md:flex" : "flex",
          )}
        >
          {isTreeCollapsed ? (
            <button
              type="button"
              onClick={() => setIsTreeCollapsed(false)}
              className="hidden md:flex w-full justify-center pt-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand tree"
              aria-label="Expand document tree"
            >
              <IconLayoutSidebarLeftCollapse size={16} className="rotate-180" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <WikiSearch onSelect={handleSelectNode} />
                <button
                  type="button"
                  onClick={() => setIsTreeCollapsed(true)}
                  className="hidden md:inline-flex shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted/70"
                  title="Collapse tree"
                  aria-label="Collapse document tree"
                >
                  <IconLayoutSidebarLeftCollapse size={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mr-1 pr-1">
                <WikiTree
                  tree={tree}
                  selectedId={docId}
                  onSelect={handleSelectNode}
                />
              </div>
            </>
          )}
        </div>

        {/* Center pane: editor. Hidden on mobile when no doc is open. */}
        <div
          className={cn(
            "min-h-0 overflow-hidden flex-col flex-1 md:flex-initial md:flex",
            hasDoc ? "flex" : "hidden md:flex",
          )}
        >
          {hasDoc && (
            <div className="md:hidden flex items-center justify-between gap-2 pb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleSelectNode("")}
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
                Outline
              </Button>
            </div>
          )}
          <WikiEditor
            docId={docId}
            allNodes={nodes ?? []}
            onHeadingsChange={setHeadings}
            jumpRequest={jumpRequest}
          />
        </div>

        {/* Right pane: outline. Hidden on mobile (accessed via dialog). */}
        <div className="hidden md:block min-h-0 rounded-lg bg-muted/40 p-3 overflow-y-auto scrollbar-thin">
          {isOutlineCollapsed ? (
            <button
              type="button"
              onClick={() => setIsOutlineCollapsed(false)}
              className="w-full flex justify-center pt-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand outline"
              aria-label="Expand outline"
            >
              <IconLayoutSidebarRightCollapse
                size={16}
                className="rotate-180"
              />
            </button>
          ) : (
            <WikiOutline
              headings={headings}
              onJump={handleJumpToHeading}
              hasDoc={hasDoc}
              onCollapse={() => setIsOutlineCollapsed(true)}
            />
          )}
        </div>
      </div>

      {/* Mobile outline dialog */}
      <Dialog open={isMobileOutlineOpen} onOpenChange={setIsMobileOutlineOpen}>
        <DialogContent className="md:hidden sm:max-w-sm">
          <DialogTitle className="sr-only">Outline</DialogTitle>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            <WikiOutline
              headings={headings}
              onJump={handleJumpToHeading}
              hasDoc={hasDoc}
              onCollapse={() => setIsMobileOutlineOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
