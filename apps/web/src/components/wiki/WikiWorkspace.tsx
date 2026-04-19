"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
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
  };

  return (
    <PageContainer title="Wiki" noScroll>
      <div
        className="grid gap-4 h-full min-h-0 transition-[grid-template-columns] duration-200"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Left pane: search + tree */}
        <div className="flex flex-col min-h-0 rounded-lg bg-muted/40 p-3 gap-3">
          {isTreeCollapsed ? (
            <button
              type="button"
              onClick={() => setIsTreeCollapsed(false)}
              className="w-full flex justify-center pt-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand tree"
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
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted/70"
                  title="Collapse tree"
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

        {/* Center pane: editor */}
        <div className="min-h-0 overflow-hidden flex flex-col">
          <WikiEditor
            docId={docId}
            allNodes={nodes ?? []}
            onHeadingsChange={setHeadings}
            jumpRequest={jumpRequest}
          />
        </div>

        {/* Right pane: outline */}
        <div className="min-h-0 rounded-lg bg-muted/40 p-3 overflow-y-auto scrollbar-thin">
          {isOutlineCollapsed ? (
            <button
              type="button"
              onClick={() => setIsOutlineCollapsed(false)}
              className="w-full flex justify-center pt-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand outline"
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
              hasDoc={docId !== null}
              onCollapse={() => setIsOutlineCollapsed(true)}
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}
