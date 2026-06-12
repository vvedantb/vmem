import { IconCheck, IconX, IconMinus } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

type CellValue = "yes" | "no" | "partial";

interface ComparisonRow {
  feature: string;
  vmem: CellValue;
  mem0: CellValue;
  supermemory: CellValue;
}

const rows: ComparisonRow[] = [
  {
    feature: "Graph-native storage",
    vmem: "yes",
    mem0: "partial",
    supermemory: "no",
  },
  {
    feature: "Context Trace (scored recall)",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Proposed updates (approve/reject)",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Pin / suppress / expire lifecycle",
    vmem: "yes",
    mem0: "partial",
    supermemory: "no",
  },
  {
    feature: "Implicit memory via MCP Resources",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Dream Mode (proactive analysis)",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Chrome extension + mobile capture",
    vmem: "yes",
    mem0: "no",
    supermemory: "partial",
  },
  {
    feature: "Team workspaces",
    vmem: "yes",
    mem0: "partial",
    supermemory: "partial",
  },
];

function Cell({ value }: { value: CellValue }) {
  if (value === "yes") {
    return (
      <div className="flex justify-center">
        <IconCheck size={16} stroke={2} className="text-foreground/80" />
      </div>
    );
  }
  if (value === "partial") {
    return (
      <div className="flex justify-center">
        <IconMinus size={16} stroke={2} className="text-muted" />
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <IconX size={14} stroke={2} className="text-foreground/20" />
    </div>
  );
}

export function Slide11Comparison() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>vs the field</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["What vmem does that others don't."]} size="xl" />

      <SlideReveal
        step={1}
        className="mt-8 overflow-hidden rounded-2xl bg-surface-secondary/40"
      >
        <div className="grid grid-cols-[1fr_80px_80px_100px] border-b border-separator/30 px-5 py-2.5">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Feature
          </span>
          <span className="text-center text-xs font-medium text-foreground">
            vmem
          </span>
          <span className="text-center text-xs text-muted">Mem0</span>
          <span className="text-center text-xs text-muted">Supermemory</span>
        </div>
        <SlideStagger delayChildren={0.12} staggerChildren={0.04} step={1}>
          {rows.map((row) => (
            <SlideItem key={row.feature}>
              <div className="grid grid-cols-[1fr_80px_80px_100px] px-5 py-2.5 hover:bg-surface-secondary/60">
                <span className="text-sm text-foreground/80">
                  {row.feature}
                </span>
                <Cell value={row.vmem} />
                <Cell value={row.mem0} />
                <Cell value={row.supermemory} />
              </div>
            </SlideItem>
          ))}
        </SlideStagger>
      </SlideReveal>

      <SlideReveal step={1} delay={0.1} className="mt-4">
        <p className="text-xs text-muted/60">
          Partial = basic or limited implementation. Data based on public
          documentation.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
