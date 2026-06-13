import { IconArrowRight } from "@tabler/icons-react";
import { Fragment } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Before/after pipeline comparison: without vmem Claude re-fetches and
 * re-reasons over every tool on every prompt; with vmem one memory call
 * returns data that is already connected and already reasoned over.
 * Chain pills stagger in left-to-right so the length difference lands.
 */

interface ChainStep {
  label: string;
  /** Visual emphasis: agent = Claude, tool = external call, reason = thinking, answer = output. */
  kind: "agent" | "tool" | "reason" | "answer";
}

const BEFORE_CHAIN: ChainStep[] = [
  { label: "Claude", kind: "agent" },
  { label: "Linear tool", kind: "tool" },
  { label: "Reason", kind: "reason" },
  { label: "SharePoint tool", kind: "tool" },
  { label: "Reason", kind: "reason" },
  { label: "Eva tool", kind: "tool" },
  { label: "Reason", kind: "reason" },
  { label: "Final answer", kind: "answer" },
];

const AFTER_CHAIN: ChainStep[] = [
  { label: "Claude", kind: "agent" },
  { label: "vmem tool", kind: "tool" },
  { label: "Reason", kind: "reason" },
  { label: "Final answer", kind: "answer" },
];

const KIND_CLASSES: Record<ChainStep["kind"], string> = {
  agent: "bg-foreground text-background",
  tool: "bg-surface-secondary text-foreground",
  reason: "bg-surface-secondary/50 text-muted",
  answer: "bg-foreground text-background",
};

function Chain({ steps, step }: { steps: ChainStep[]; step: number }) {
  return (
    <SlideStagger
      className="flex flex-wrap items-center gap-2"
      staggerChildren={0.18}
      step={step}
    >
      {steps.map((s, i) => (
        <Fragment key={`${s.label}-${i}`}>
          {i > 0 ? (
            <SlideItem>
              <IconArrowRight
                size={16}
                stroke={1.5}
                className="text-muted/60"
              />
            </SlideItem>
          ) : null}
          <SlideItem>
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${KIND_CLASSES[s.kind]}`}
            >
              {s.label}
            </span>
          </SlideItem>
        </Fragment>
      ))}
    </SlideStagger>
  );
}

export function Slide17Pipeline() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why it matters</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One call, not five."]} size="xl" />

      {/* BEFORE — long chain, re-fetched and re-reasoned every prompt */}
      <SlideReveal step={1} className="mt-10">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
          Before — without vmem
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Claude pieces the data together and reasons over it again on every
          single prompt.
        </p>
      </SlideReveal>
      <div className="mt-4 rounded-2xl bg-surface-secondary/40 px-6 py-5">
        <Chain steps={BEFORE_CHAIN} step={1} />
      </div>

      {/* AFTER — one memory call, already connected, already reasoned over */}
      <SlideReveal step={2} className="mt-10">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
          After — with vmem
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          One call to memory returns the Linear, SharePoint, and Eva data
          already stored in one place — already connected, already reasoned
          over.
        </p>
      </SlideReveal>
      <div className="mt-4 rounded-2xl bg-surface-secondary/40 px-6 py-5">
        <Chain steps={AFTER_CHAIN} step={2} />
      </div>
    </SlideShell>
  );
}
