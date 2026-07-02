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
    label: "Meaning",
    score: "0.91",
    reason: "Same idea — you said “budget”, the note says “spend”",
  },
  {
    label: "Topic",
    score: "0.85",
    reason: "Shared topics — Q3, budget, planning",
  },
  {
    label: "Timing",
    score: "0.72",
    reason: "Saved just after your own planning note",
  },
];

const traceMemory = {
  text: "In the March planning call, we capped Q3 marketing spend at £40k.",
  source: "From your planning-call notes · 12 Mar",
};

export function Slide06Trace() {
  return (
    <SlideShell>
      <div className="flex h-full items-center gap-14">
        <div className="flex flex-1 flex-col justify-center">
          <SlideReveal delay={0}>
            <SlideKicker>Why this memory showed up</SlideKicker>
          </SlideReveal>
          <BlurWordsTitle
            lines={["Every recall", "explains itself."]}
            size="xl"
          />
          <SlideReveal delay={0.08} className="mt-5 max-w-md">
            <SlideBody>
              Other tools just hand you a memory with no explanation. vmem shows
              you the actual reasons it picked this one.
            </SlideBody>
          </SlideReveal>
          <SlideReveal step={2} className="mt-5 max-w-md">
            <SlideBody className="text-foreground">
              So you choose how much to trust each match — nothing's hidden
              behind a black box.
            </SlideBody>
          </SlideReveal>
        </div>

        <SlideReveal delay={0.1} className="w-[440px] shrink-0">
          <TraceMatchPanel
            query="What did we decide on the Q3 budget?"
            memory={traceMemory}
            rows={traceRows}
          />
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
