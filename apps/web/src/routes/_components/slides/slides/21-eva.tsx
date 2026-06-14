import {
  IconBolt,
  IconChecklist,
  IconFileText,
  IconMessageQuestion,
  IconPencil,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { EvaIcon } from "@/components/brand-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideBody,
  SlideItem,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Remembers {
  icon: ComponentType<IconProps>;
  label: string;
}

const REMEMBERS: Remembers[] = [
  { icon: IconBolt, label: "Every action performed" },
  { icon: IconChecklist, label: "Every task created" },
  { icon: IconPencil, label: "Every change requested" },
  { icon: IconFileText, label: "Every PRD written" },
  { icon: IconMessageQuestion, label: "Every question asked" },
];

export function Slide21Eva() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <div className="mb-4 flex items-center gap-2.5">
          <EvaIcon size={26} className="rounded-md" />
          <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
            Dogfooding
          </span>
        </div>
      </SlideReveal>
      <BlurWordsTitle lines={["Eva runs on vmem."]} size="xl" />
      <SlideReveal delay={0.1} className="mt-4 max-w-2xl">
        <SlideBody>
          Eva is our own internal agent. Wire vmem in and she remembers
          everything she has ever done.
        </SlideBody>
      </SlideReveal>

      {/* Step 1 — the full working memory */}
      <SlideStagger
        className="mt-8 grid grid-cols-5 gap-4"
        delayChildren={0.06}
        staggerChildren={0.1}
        step={1}
      >
        {REMEMBERS.map(({ icon: Icon, label }) => (
          <SlideItem key={label}>
            <div className="flex h-full flex-col items-start gap-3 rounded-2xl bg-surface-secondary/60 px-4 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={15} stroke={1.5} />
              </div>
              <p className="text-sm font-medium leading-snug text-foreground">
                {label}
              </p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      {/* Step 2 — the compounding flywheel */}
      <SlideReveal step={2} className="mt-6">
        <div className="flex items-center gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
          <EvaIcon size={28} className="shrink-0 rounded-md" />
          <p className="text-base leading-relaxed">
            She keeps getting better as the data vmem holds grows — continuous
            iteration, learning from every mistake.
          </p>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
