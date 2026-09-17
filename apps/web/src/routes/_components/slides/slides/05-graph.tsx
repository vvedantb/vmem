import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideMemoryPreview } from "../_components/SlideMemoryPreview";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

const graphConcepts = [
  ["Topics", "The themes that come up again and again across your memories."],
  ["Names", "The people, products, and projects you mention."],
  [
    "Links",
    "How memories connect — same chat, same subject, or similar meaning.",
  ],
] as const;

export function Slide05Graph() {
  return (
    <SlideShell>
      <div className="flex h-full gap-14">
        <div className="flex flex-1 flex-col justify-center">
          <SlideReveal delay={0}>
            <SlideKicker>How it connects</SlideKicker>
          </SlideReveal>
          <BlurWordsTitle
            lines={["Everything links to everything."]}
            size="xl"
          />
          <SlideReveal step={1} className="mt-6">
            <SlideBody>
              Every memory links to the people, topics, and other memories it
              touches. One thing leads to the next — so when you ask, the whole
              web of context comes back, not just a single note.
            </SlideBody>
          </SlideReveal>
          <SlideStagger
            className="mt-8 space-y-3"
            delayChildren={0.06}
            step={2}
          >
            {graphConcepts.map(([label, desc]) => (
              <SlideItem key={label}>
                <div className="flex gap-3">
                  <span className="mt-0.5 w-16 shrink-0 text-xs font-medium uppercase tracking-[0.18em] text-foreground/50">
                    {label}
                  </span>
                  <span className="text-xs leading-relaxed text-muted">
                    {desc}
                  </span>
                </div>
              </SlideItem>
            ))}
          </SlideStagger>
        </div>
        <SlideReveal
          delay={0.1}
          className="flex w-[380px] shrink-0 flex-col justify-center"
        >
          <SlideMemoryPreview loop={false} />
          <p className="mt-3 text-center text-xs text-muted/60">
            Click any memory during the talk.
          </p>
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
