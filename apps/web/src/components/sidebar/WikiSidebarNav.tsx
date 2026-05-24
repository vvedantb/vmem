"use client";

import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@vmem/backend";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { IconArrowLeft, IconBook } from "@tabler/icons-react";
import WikiTree from "@/components/wiki/WikiTree";
import WikiSearch from "@/components/wiki/WikiSearch";
import { useWikiSidebar } from "@/components/wiki/WikiSidebarContext";
import { buildTree, findFirstDocumentId } from "@/components/wiki/_utils";

export type WikiSidebarNavProps = {
  isIconOnly: boolean;
  isMobile: boolean;
  onBack: () => void;
};

export function WikiSidebarNav({
  isIconOnly,
  isMobile,
  onBack,
}: WikiSidebarNavProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const docId =
    typeof params.docId === "string" && params.docId.length > 0
      ? params.docId
      : null;

  const nodes = useQuery(api.wiki.listTree);
  const { outlineVisible, setOutlineVisible, wordCount, hasDoc } =
    useWikiSidebar();

  const tree = useMemo(() => (nodes ? buildTree(nodes) : []), [nodes]);

  const handleSelectNode = useCallback(
    (id: string) => {
      if (id.length > 0) {
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

  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="shrink-0 px-1 mb-2">
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={onBack}
              title={isIconOnly ? "Back" : undefined}
              className={cn(
                "group relative flex w-full items-center rounded-xl text-sm font-medium tracking-normal transition-[transform,background-color,color] duration-200 ease-smooth active:scale-[0.98] text-muted-foreground hover:bg-card/45 hover:text-foreground",
                isIconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5",
                isMobile ? "py-3.5" : "py-2.5",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center text-current">
                <IconArrowLeft size={18} stroke={1.7} />
              </span>
              <AnimatePresence initial={false}>
                {!isIconOnly ? (
                  <motion.span
                    key="wiki-back-label"
                    className="flex-1 text-left"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: motionDuration.fast,
                      ease: motionEase,
                    }}
                  >
                    Back
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </li>
        </ul>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1">
        {nodes === undefined ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <IconBook size={28} className="mb-2 text-muted-foreground" />
            {!isIconOnly ? (
              <p className="text-xs text-muted-foreground">No documents yet</p>
            ) : null}
          </div>
        ) : (
          <>
            {!isIconOnly ? <WikiSearch onSelect={handleSelectNode} /> : null}
            <WikiTree
              tree={tree}
              selectedId={docId}
              onSelect={handleSelectNode}
              outlineVisible={outlineVisible}
              onOutlineVisibleChange={setOutlineVisible}
              hasDoc={hasDoc}
              wordCount={wordCount}
            />
          </>
        )}
      </div>
    </motion.nav>
  );
}
