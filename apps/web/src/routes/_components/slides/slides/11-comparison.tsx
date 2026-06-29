import type { ReactNode } from "react";
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
    feature: "Memories that connect to each other",
    vmem: "yes",
    mem0: "partial",
    supermemory: "no",
  },
  {
    feature: "Shows why each memory matched",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Asks before it overwrites",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Pin, hide, or expire memories",
    vmem: "yes",
    mem0: "partial",
    supermemory: "no",
  },
  {
    feature: "Works automatically in the background",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Improves your memories on its own",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
  },
  {
    feature: "Capture from browser and phone",
    vmem: "yes",
    mem0: "no",
    supermemory: "partial",
  },
  {
    feature: "Shared team spaces",
    vmem: "yes",
    mem0: "partial",
    supermemory: "partial",
  },
];

/** Brand logo chip + name, stacked, for a comparison column header. */
function BrandCol({
  logo,
  label,
  emphasised = false,
}: {
  logo: ReactNode;
  label: string;
  emphasised?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface">
        {logo}
      </span>
      <span
        className={
          emphasised
            ? "text-xs font-medium text-foreground"
            : "text-xs text-muted"
        }
      >
        {label}
      </span>
    </div>
  );
}

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
        <div className="grid grid-cols-[1fr_80px_80px_100px] items-end border-b border-separator/30 px-5 py-3">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Feature
          </span>
          <BrandCol
            label="vmem"
            emphasised
            logo={
              <img
                src="/icon.png"
                alt="vmem"
                className="h-7 w-7 rounded-lg"
                draggable={false}
              />
            }
          />
          <BrandCol
            label="Mem0"
            logo={
              <img
                src="/slides/logo-mem0.svg"
                alt="Mem0"
                className="h-4 w-4"
                draggable={false}
              />
            }
          />
          <BrandCol
            label="Supermemory"
            logo={
              <img
                src="/slides/logo-supermemory.svg"
                alt="Supermemory"
                className="h-4 w-4"
                draggable={false}
              />
            }
          />
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
          Partial = basic or limited. Based on public information.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
