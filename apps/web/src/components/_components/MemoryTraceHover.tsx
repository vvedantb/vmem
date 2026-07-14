import type { ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@vmem/ui";
import type { MemoryTrace } from "./memory-trace";
import MemoryScoreBar from "./MemoryScoreBar";

interface MemoryTraceHoverProps {
  title: string;
  trace: MemoryTrace;
  children: ReactNode;
}

// hover breakdown for hybrid-search memory hits — explains why a memory matched
export default function MemoryTraceHover({
  title,
  trace,
  children,
}: MemoryTraceHoverProps) {
  const { scoreBreakdown } = trace;

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="end" className="w-72">
        <p className="mb-1 truncate text-xs font-medium text-foreground">
          {title}
        </p>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            Retrieval score
          </span>
          <span className="text-sm font-medium tabular-nums text-foreground">
            {trace.score.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <MemoryScoreBar
            label="Content match"
            value={scoreBreakdown.fulltext}
          />
          <MemoryScoreBar
            label="Semantic match"
            value={scoreBreakdown.vector}
          />
          <MemoryScoreBar label="Recency" value={scoreBreakdown.recency} />
          <MemoryScoreBar
            label="Confidence"
            value={scoreBreakdown.confidence}
          />
          {scoreBreakdown.chunk > 0 ? (
            <MemoryScoreBar label="Chunk match" value={scoreBreakdown.chunk} />
          ) : null}
          {scoreBreakdown.entity > 0 ? (
            <MemoryScoreBar
              label="Entity match"
              value={scoreBreakdown.entity}
            />
          ) : null}
        </div>
        <p className="mt-3 text-[11px] italic leading-snug text-muted">
          {trace.reason}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
