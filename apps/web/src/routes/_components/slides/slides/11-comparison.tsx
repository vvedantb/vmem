import type { ReactNode } from "react";
import { IconCheck, IconX, IconMinus } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { ToolLogo } from "../_components/ToolLogos";
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
  chatgpt: CellValue;
  claude: CellValue;
}

// Competitor states based on public information, July 2026. ChatGPT and Claude
// both ship background + self-improving memory now (conceded as "yes");
// Supermemory added a shared team knowledge graph (team "yes", graph "partial")
// but its automatic-background capture is recent, so left crossed.
const rows: ComparisonRow[] = [
  {
    feature: "Memories that connect to each other",
    vmem: "yes",
    mem0: "yes",
    supermemory: "yes",
    chatgpt: "no",
    claude: "no",
  },
  {
    feature: "Shows why each memory matched",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
    chatgpt: "no",
    claude: "no",
  },
  {
    feature: "Asks before it overwrites",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
    chatgpt: "no",
    claude: "no",
  },
  {
    feature: "Pin, hide, or expire memories",
    vmem: "yes",
    mem0: "partial",
    supermemory: "no",
    chatgpt: "partial",
    claude: "partial",
  },
  {
    feature: "Works automatically in the background",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
    chatgpt: "yes",
    claude: "yes",
  },
  {
    feature: "Improves your memories on its own",
    vmem: "yes",
    mem0: "no",
    supermemory: "no",
    chatgpt: "yes",
    claude: "yes",
  },
  {
    feature: "Capture from browser and phone",
    vmem: "yes",
    mem0: "no",
    supermemory: "partial",
    chatgpt: "partial",
    claude: "partial",
  },
  {
    feature: "Shared team spaces",
    vmem: "yes",
    mem0: "partial",
    supermemory: "yes",
    chatgpt: "no",
    claude: "no",
  },
];

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,88px)]";

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
            ? "whitespace-nowrap text-[11px] font-medium text-foreground"
            : "whitespace-nowrap text-[11px] text-muted"
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
        <div
          className={`${GRID} items-end border-b border-separator/30 px-5 py-3`}
        >
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
          <BrandCol
            label="ChatGPT"
            logo={
              <ToolLogo tool="chatgpt" className="h-4 w-4 text-foreground" />
            }
          />
          <BrandCol
            label="Claude"
            logo={<ToolLogo tool="claude" className="h-4 w-4" />}
          />
        </div>
        <SlideStagger delayChildren={0.12} staggerChildren={0.04} step={1}>
          {rows.map((row) => (
            <SlideItem key={row.feature}>
              <div
                className={`${GRID} px-5 py-2.5 hover:bg-surface-secondary/60`}
              >
                <span className="text-sm text-foreground/80">
                  {row.feature}
                </span>
                <Cell value={row.vmem} />
                <Cell value={row.mem0} />
                <Cell value={row.supermemory} />
                <Cell value={row.chatgpt} />
                <Cell value={row.claude} />
              </div>
            </SlideItem>
          ))}
        </SlideStagger>
      </SlideReveal>

      <SlideReveal step={1} delay={0.1} className="mt-4">
        <p className="text-xs text-muted/60">
          Partial = basic or limited. Based on public information, July 2026.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
