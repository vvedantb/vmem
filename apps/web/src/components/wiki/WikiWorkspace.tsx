"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { IconArrowLeft, IconListDetails } from "@tabler/icons-react";
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
 * Layout mirrors skills: plain list column, document pane on muted surface.
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
  const [isOutlineVisible, setIsOutlineVisible] = useState(false);
  const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

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
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
    setIsMobileOutlineOpen(false);
  };

  const hasDoc = docId !== null && docId.length > 0;

  useEffect(() => {
    if (!hasDoc) {
      setIsOutlineVisible(false);
      setWordCount(0);
    }
  }, [hasDoc]);

  return (
    <PageContainer title="Wiki" noScroll>
      <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2 overflow-y-auto md:w-1/3 md:shrink-0",
            hasDoc ? "hidden md:flex" : "flex flex-1 w-full",
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

        <div
          className={cn(
            "flex min-h-0 min-w-0 gap-4",
            hasDoc ? "flex flex-1 w-full" : "hidden md:flex md:flex-1",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              "md:rounded-xl md:bg-muted/40",
              !hasDoc && "items-center justify-center",
            )}
          >
            {hasDoc && (
              <div className="flex items-center justify-between gap-2 p-2 md:hidden">
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
                  View outline
                </Button>
              </div>
            )}
            {hasDoc ? (
              <WikiEditor
                docId={docId}
                allNodes={nodes ?? []}
                onHeadingsChange={setHeadings}
                onWordCountChange={setWordCount}
                jumpRequest={jumpRequest}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a document to start writing.
              </p>
            )}
          </div>

          {isOutlineVisible && hasDoc ? (
            <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto scrollbar-thin md:block">
              <WikiOutline
                headings={headings}
                onJump={handleJumpToHeading}
                hasDoc={hasDoc}
              />
            </div>
          ) : null}
        </div>
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
