import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { TraceMatchPanel } from "../_components/TraceMatchPanel";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

const traceRows = [
  {
    label: "meaning",
    score: "0.91",
    reason: "Same project — different words, same topic",
  },
  {
    label: "name",
    score: "0.85",
    reason: "Both mention the budget review from March",
  },
  {
    label: "conversation",
    score: "0.72",
    reason: "Saved minutes after your planning note",
  },
  {
    label: "topic",
    score: "0.68",
    reason: "Shared topics: planning, budget, Q3",
  },
];

export function Slide06Trace() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why this memory showed up</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Every recall explains itself."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-3 max-w-xl">
        <SlideBody className="text-base text-foreground">
          Other tools hand you memories with no explanation. vmem shows you why
          each one matched.
        </SlideBody>
      </SlideReveal>

      <TraceMatchPanel
        rows={traceRows}
        footer="You choose how much to trust each match. Nothing hidden behind a black box."
      />
    </SlideShell>
  );
}
