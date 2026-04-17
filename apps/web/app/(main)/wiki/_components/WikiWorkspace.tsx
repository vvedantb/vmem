"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useQueryState } from "nuqs";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { wikiSearchParams } from "../searchParams";
import { buildTree } from "../_utils";
import type { OutlineHeading } from "../_utils";
import WikiTree from "./WikiTree";
import WikiEditor from "./WikiEditor";
import WikiOutline from "./WikiOutline";
import WikiSearch from "./WikiSearch";

/**
 * Three-pane shell for /wiki. Tree on the left, editor center, outline right.
 * Selected document id lives in `?doc=<id>` (nuqs). Tree writes, editor reads.
 *
 * Outline state is lifted here because the editor emits headings on update
 * but the outline pane needs them for rendering/jumping — keeping it here lets
 * the outline pane stay stateless and re-render whenever editor emits.
 */
export default function WikiWorkspace() {
  const [docId, setDocId] = useQueryState("doc", wikiSearchParams.doc);
  const nodes = useQuery(api.wiki.listTree);

  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [jumpRequest, setJumpRequest] = useState<{ pos: number; n: number }>({
    pos: 0,
    n: 0,
  });

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const selectedDocId = docId.length > 0 ? docId : null;

  const handleSelectNode = (id: string) => {
    void setDocId(id);
  };

  const handleJumpToHeading = (pos: number) => {
    // Bump `n` so React treats each click as a new effect tick even if pos is identical.
    setJumpRequest((prev) => ({ pos, n: prev.n + 1 }));
  };

  return (
    <PageContainer title="Wiki" noScroll>
      <div className="grid grid-cols-[280px_1fr_220px] gap-4 h-full min-h-0">
        {/* Left pane: search + tree */}
        <div className="flex flex-col min-h-0 rounded-lg bg-muted/40 p-3 gap-3">
          <WikiSearch onSelect={handleSelectNode} />
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mr-1 pr-1">
            <WikiTree
              tree={tree}
              selectedId={selectedDocId}
              onSelect={handleSelectNode}
            />
          </div>
        </div>

        {/* Center pane: editor */}
        <div className="min-h-0 overflow-hidden flex flex-col">
          <WikiEditor
            docId={selectedDocId}
            allNodes={nodes ?? []}
            onHeadingsChange={setHeadings}
            jumpRequest={jumpRequest}
          />
        </div>

        {/* Right pane: outline */}
        <div className="min-h-0 rounded-lg bg-muted/40 p-3 overflow-y-auto scrollbar-thin">
          <WikiOutline
            headings={headings}
            onJump={handleJumpToHeading}
            hasDoc={selectedDocId !== null}
          />
        </div>
      </div>
    </PageContainer>
  );
}
