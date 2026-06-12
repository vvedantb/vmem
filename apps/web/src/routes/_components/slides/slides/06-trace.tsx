import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

const traceRows = [
  {
    label: "vector",
    score: "0.91",
    reason: "semantic similarity — same project context",
  },
  {
    label: "entity",
    score: "0.85",
    reason: "shared entity: Neo4j sync lag (March refactor)",
  },
  {
    label: "session",
    score: "0.72",
    reason: "same 15-min session as the original debugging note",
  },
  {
    label: "tag",
    score: "0.68",
    reason: "tags overlap: debugging, backend, performance",
  },
];

export function Slide06Trace() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Context Trace — differentiator</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Every recall explains itself."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-4 max-w-xl">
        <SlideBody>
          Mem0 and Supermemory give you memories back. vmem gives you memories{" "}
          <em>with receipts</em> — a scored breakdown of exactly why each one
          surfaced.
        </SlideBody>
      </SlideReveal>

      <SlideReveal
        step={1}
        className="mt-8 rounded-2xl bg-surface-secondary/60 px-6 py-5"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            memory.retrieve result
          </p>
          <p className="font-mono text-xs text-muted/60">1 match · 4 signals</p>
        </div>
        <SlideStagger
          className="space-y-2"
          delayChildren={0.12}
          staggerChildren={0.08}
          step={1}
        >
          {traceRows.map(({ label, score, reason }) => (
            <SlideItem key={label}>
              <div className="flex items-start gap-4 rounded-xl bg-surface-secondary/80 px-3 py-2.5">
                <span className="w-14 shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-center font-mono text-[10px] text-foreground/70">
                  {label}
                </span>
                <span className="w-9 shrink-0 font-mono text-xs font-medium text-foreground">
                  {score}
                </span>
                <span className="text-xs leading-relaxed text-muted">
                  {reason}
                </span>
              </div>
            </SlideItem>
          ))}
        </SlideStagger>
      </SlideReveal>

      <SlideReveal step={2} className="mt-6">
        <SlideBody>
          Agents can decide how much weight to give each memory. No black-box
          retrieval.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
