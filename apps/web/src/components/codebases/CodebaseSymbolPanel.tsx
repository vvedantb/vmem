// right-side symbol detail panel

import {
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
import type { CodebaseSymbolContext, CodeNodeKind } from "./-types";
import { useSymbolContext } from "@/hooks/useCodebaseGraphData";
import { SlideOverPanel } from "@/components/_components/detail-panel/SlideOverPanel";

interface CodebaseSymbolPanelProps {
  codebaseId: string;
  selectedSymbolId: string | null;
  blastDirection: "upstream" | "downstream";
  onClose: () => void;
  onSelectSymbol: (id: string | null) => void;
  onToggleBlastDirection: () => void;
}

const KIND_ICON_MAP = new Map<CodeNodeKind, typeof IconFile>([
  ["code-file", IconFile],
  ["code-function", IconFunction],
  ["code-class", IconHexagon],
  ["code-interface", IconCube],
  ["code-process", IconRoute],
]);

function KindIcon({ kind, size = 18 }: { kind: CodeNodeKind; size?: number }) {
  const Icon = KIND_ICON_MAP.get(kind) ?? IconHash;
  return <Icon size={size} className="text-muted flex-shrink-0" />;
}

const SYMBOL_TRAIT_CONFIG: {
  field: "isExported" | "isAsync" | "isTest";
  icon: typeof IconShieldCheck;
  label: string;
}[] = [
  { field: "isExported", icon: IconShieldCheck, label: "exported" },
  { field: "isAsync", icon: IconBolt, label: "async" },
  { field: "isTest", icon: IconFlask, label: "test" },
];

export function CodebaseSymbolPanel({
  codebaseId,
  selectedSymbolId,
  blastDirection,
  onClose,
  onSelectSymbol,
  onToggleBlastDirection,
}: CodebaseSymbolPanelProps) {
  const { context, isLoading } = useSymbolContext(codebaseId, selectedSymbolId);

  return (
    <SlideOverPanel
      open={selectedSymbolId !== null}
      width="w-80"
      onClose={onClose}
      header={
        <div className="min-w-0 flex-1 flex items-start gap-2">
          {context ? (
            <KindIcon kind={context.kind} />
          ) : (
            <IconHash size={18} className="text-muted mt-0.5" />
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {context?.name ?? (isLoading ? "Loading..." : "Unknown symbol")}
            </h2>
            {context && (
              <p className="text-xs text-muted mt-0.5 font-mono truncate">
                {context.qualifiedName}
              </p>
            )}
          </div>
        </div>
      }
    >
      {context ? (
        <>
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
            <SymbolTraitBadges context={context} />
          </div>

          {/* The blastradiusof URL param is the source of truth for the blast
              radius filter on the canvas; this button only flips the
              direction (upstream/downstream), it does not re-select. */}
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

          <SymbolRelationSection
            icon={IconArrowRight}
            title="Calls"
            items={context.callsOut}
            onNavigate={onSelectSymbol}
            className="mt-2"
          />
          <SymbolRelationSection
            icon={IconArrowLeft}
            title="Called by"
            items={context.callsIn}
            onNavigate={onSelectSymbol}
          />

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
                  <Button
                    key={proc.id}
                    type="button"
                    variant="ghost"
                    onClick={() => onSelectSymbol(proc.id)}
                    className="h-auto w-full rounded-md bg-surface-secondary/40 p-2 text-left hover:bg-surface-tertiary"
                  >
                    <p className="text-xs font-medium text-foreground truncate font-mono">
                      {proc.name}
                    </p>
                  </Button>
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
    </SlideOverPanel>
  );
}

type SymbolNeighbour = CodebaseSymbolContext["callsIn"][number];

function SymbolTraitBadges({ context }: { context: CodebaseSymbolContext }) {
  const traits = SYMBOL_TRAIT_CONFIG.filter((trait) => context[trait.field]);
  if (traits.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {traits.map(({ field, icon: TraitIcon, label }) => (
        <Badge
          key={field}
          variant="outline"
          className="bg-surface-secondary/40 text-[10px] h-5 px-1.5 border-0"
        >
          <TraitIcon size={10} className="mr-1" />
          {label}
        </Badge>
      ))}
    </div>
  );
}

function SymbolRelationSection({
  icon: SectionIcon,
  title,
  items,
  onNavigate,
  className,
}: {
  icon: typeof IconArrowRight;
  title: string;
  items: SymbolNeighbour[];
  onNavigate: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={className ? `px-4 py-2 ${className}` : "px-4 py-2"}>
      <div className="flex items-center gap-1.5 mb-2">
        <SectionIcon size={12} className="text-muted" />
        <span className="text-xs font-medium text-muted">{title}</span>
        <Badge
          variant="outline"
          className="text-[10px] h-4 px-1 bg-surface-secondary border-0"
        >
          {items.length}
        </Badge>
      </div>
      <NeighbourList items={items} onNavigate={onNavigate} />
    </div>
  );
}

function NeighbourList({
  items,
  onNavigate,
}: {
  items: SymbolNeighbour[];
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="space-y-1 max-h-44 overflow-y-auto pr-1 scrollbar-thin">
      {items.map((item) => (
        <Button
          key={item.id}
          type="button"
          variant="ghost"
          onClick={() => onNavigate(item.id)}
          className="h-auto w-full rounded-md bg-surface-secondary/40 p-2 text-left hover:bg-surface-tertiary [content-visibility:auto] [contain-intrinsic-size:0_2.75rem]"
        >
          <p className="text-xs font-medium text-foreground truncate font-mono">
            {item.name}
          </p>
          <p className="text-[10px] text-muted truncate mt-0.5 font-mono">
            {item.filePath}
          </p>
        </Button>
      ))}
    </div>
  );
}
