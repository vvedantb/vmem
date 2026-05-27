"use client";

/**
 * Right-side symbol detail panel.
 *
 * Renders metadata + neighbours + process membership for the currently
 * selected codebase symbol. Backed by `useSymbolContext` rather than the
 * graph payload so we always show the freshest call edges (the graph's
 * `kinds` filter can hide neighbours that are still relevant to the panel).
 *
 * Visibility is driven by the controller's `selectedSymbolId`, which is
 * stored in the URL (`?blastRadiusOf=…`) so refreshing the page or sharing
 * the URL preserves the user's selection.
 */

import { useCallback } from "react";
import {
  IconX,
  IconArrowRight,
  IconArrowLeft,
  IconFile,
  IconFunction,
  IconCube,
  IconRoute,
  IconHexagon,
  IconHash,
  IconPlayerPlay,
  IconShieldCheck,
  IconBolt,
  IconFlask,
  IconArrowsLeftRight,
} from "@tabler/icons-react";
import { Badge, Button } from "@vmem/ui";
import { AnimatePresence, motion } from "motion/react";
import {
  useSymbolContext,
  type CodeNodeKind,
} from "@/hooks/useCodebaseGraphData";

interface CodebaseSymbolPanelProps {
  codebaseId: string;
  selectedSymbolId: string | null;
  blastDirection: "upstream" | "downstream";
  onClose: () => void;
  onSelectSymbol: (id: string | null) => void;
  onToggleBlastDirection: () => void;
}

function KindIcon({ kind, size = 18 }: { kind: CodeNodeKind; size?: number }) {
  const cls = "text-muted flex-shrink-0";
  if (kind === "code-file") return <IconFile size={size} className={cls} />;
  if (kind === "code-function")
    return <IconFunction size={size} className={cls} />;
  if (kind === "code-class") return <IconHexagon size={size} className={cls} />;
  if (kind === "code-interface")
    return <IconCube size={size} className={cls} />;
  if (kind === "code-process") return <IconRoute size={size} className={cls} />;
  return <IconHash size={size} className={cls} />;
}

export function CodebaseSymbolPanel({
  codebaseId,
  selectedSymbolId,
  blastDirection,
  onClose,
  onSelectSymbol,
  onToggleBlastDirection,
}: CodebaseSymbolPanelProps) {
  const { context, isLoading } = useSymbolContext(codebaseId, selectedSymbolId);

  const handleNavigate = useCallback(
    (id: string) => {
      onSelectSymbol(id);
    },
    [onSelectSymbol],
  );

  return (
    <AnimatePresence>
      {selectedSymbolId && (
        <motion.div
          key="symbol-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 bottom-0 w-80 z-20 glass-panel-strong overflow-y-auto hidden md:flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 pb-2">
            <div className="min-w-0 flex-1 flex items-start gap-2">
              {context ? (
                <KindIcon kind={context.kind} />
              ) : (
                <IconHash size={18} className="text-muted mt-0.5" />
              )}
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {context?.name ??
                    (isLoading ? "Loading..." : "Unknown symbol")}
                </h2>
                {context && (
                  <p className="text-xs text-muted mt-0.5 font-mono truncate">
                    {context.qualifiedName}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-tertiary/50 transition-colors flex-shrink-0"
              aria-label="Close panel"
            >
              <IconX size={16} />
            </button>
          </div>

          {context ? (
            <>
              {/* File + line range */}
              <div className="px-4 py-2 space-y-2 text-xs">
                <div>
                  <span className="text-muted">File</span>
                  <p className="text-foreground font-mono mt-0.5 truncate">
                    {context.filePath || "—"}
                  </p>
                </div>
                {context.startLine !== undefined &&
                  context.endLine !== undefined && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-muted">Lines</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {context.startLine}–{context.endLine}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted">Length</span>
                        <p className="text-foreground font-mono mt-0.5">
                          {context.endLine - context.startLine + 1} loc
                        </p>
                      </div>
                    </div>
                  )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {context.isExported && (
                    <Badge
                      variant="outline"
                      className="bg-surface-secondary/40 text-[10px] h-5 px-1.5 border-0"
                    >
                      <IconShieldCheck size={10} className="mr-1" />
                      exported
                    </Badge>
                  )}
                  {context.isAsync && (
                    <Badge
                      variant="outline"
                      className="bg-surface-secondary/40 text-[10px] h-5 px-1.5 border-0"
                    >
                      <IconBolt size={10} className="mr-1" />
                      async
                    </Badge>
                  )}
                  {context.isTest && (
                    <Badge
                      variant="outline"
                      className="bg-surface-secondary/40 text-[10px] h-5 px-1.5 border-0"
                    >
                      <IconFlask size={10} className="mr-1" />
                      test
                    </Badge>
                  )}
                </div>
              </div>

              {/* Blast-direction toggle. Selecting a symbol always activates
                  the blast-radius filter on the canvas (single source of truth
                  via `blastRadiusOf` URL param) — this button just flips the
                  direction so the user can compare upstream callers vs the
                  downstream call tree without re-selecting. */}
              {(context.kind === "code-function" ||
                context.kind === "code-class") && (
                <div className="px-4 pt-2 pb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onToggleBlastDirection}
                  >
                    <IconArrowsLeftRight size={14} className="mr-1" />
                    Showing {blastDirection} — flip
                  </Button>
                </div>
              )}

              {/* Calls Out */}
              {context.callsOut.length > 0 && (
                <div className="px-4 py-2 mt-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <IconArrowRight size={12} className="text-muted" />
                    <span className="text-xs font-medium text-muted">
                      Calls
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1 bg-surface-secondary border-0"
                    >
                      {context.callsOut.length}
                    </Badge>
                  </div>
                  <NeighbourList
                    items={context.callsOut}
                    onNavigate={handleNavigate}
                  />
                </div>
              )}

              {/* Calls In */}
              {context.callsIn.length > 0 && (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <IconArrowLeft size={12} className="text-muted" />
                    <span className="text-xs font-medium text-muted">
                      Called by
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1 bg-surface-secondary border-0"
                    >
                      {context.callsIn.length}
                    </Badge>
                  </div>
                  <NeighbourList
                    items={context.callsIn}
                    onNavigate={handleNavigate}
                  />
                </div>
              )}

              {/* Processes */}
              {context.processes.length > 0 && (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <IconPlayerPlay size={12} className="text-muted" />
                    <span className="text-xs font-medium text-muted">
                      Processes
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1 bg-surface-secondary border-0"
                    >
                      {context.processes.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {context.processes.map((proc) => (
                      <button
                        key={proc.id}
                        type="button"
                        onClick={() => handleNavigate(proc.id)}
                        className="w-full p-2 rounded-md bg-surface-secondary/40 hover:bg-surface-tertiary transition-colors text-left"
                      >
                        <p className="text-xs font-medium text-foreground truncate font-mono">
                          {proc.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {context.callsIn.length === 0 &&
                context.callsOut.length === 0 &&
                context.processes.length === 0 && (
                  <div className="px-4 py-6 text-center mt-2">
                    <p className="text-xs text-muted">
                      No call relationships or processes for this symbol.
                    </p>
                  </div>
                )}
            </>
          ) : isLoading ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted">Loading…</p>
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted">
                Symbol not found. It may have been removed in a recent sync.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NeighbourList({
  items,
  onNavigate,
}: {
  items: { id: string; name: string; filePath: string }[];
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="space-y-1 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onNavigate(item.id)}
          className="w-full p-2 rounded-md bg-surface-secondary/40 hover:bg-surface-tertiary transition-colors text-left"
        >
          <p className="text-xs font-medium text-foreground truncate font-mono">
            {item.name}
          </p>
          <p className="text-[10px] text-muted truncate mt-0.5 font-mono">
            {item.filePath}
          </p>
        </button>
      ))}
    </div>
  );
}
