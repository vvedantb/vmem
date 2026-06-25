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
    label: "meaning",
    score: "0.91",
    reason: "Same project context — different words, same topic",
  },
  {
    label: "name",
    score: "0.85",
    reason: "Both mention the same database slowdown from March",
  },
  {
    label: "conversation",
    score: "0.72",
    reason: "Saved within 15 minutes of your debugging memory",
  },
  {
    label: "topic",
    score: "0.68",
    reason: "Shared labels: debugging, backend, performance",
  },
];

export function Slide06Trace() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why this memory showed up</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Every recall explains itself."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-4 max-w-xl">
        <SlideBody>
          Other tools hand you memories with no explanation. vmem shows you why
          each one matched — same topic, same person, same conversation,
          overlapping labels.
        </SlideBody>
      </SlideReveal>

      <SlideReveal
        step={1}
        className="mt-8 rounded-2xl bg-surface-secondary/60 px-6 py-5"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Search result — why it matched
          </p>
          <p className="font-mono text-xs text-muted/60">1 match · 4 reasons</p>
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
          You choose how much to trust each match. Nothing hidden behind a black
          box.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
