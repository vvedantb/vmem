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
  ["Tags", "Recurring themes — generalised vocabulary across all memories."],
  ["Entities", "Specific names: people, products, repos, APIs."],
  ["Edges", "Same session, semantic similarity, or LLM-detected relation."],
] as const;

export function Slide05Graph() {
  return (
    <SlideShell>
      <div className="flex h-full gap-14">
        <div className="flex flex-1 flex-col justify-center">
          <SlideReveal delay={0}>
            <SlideKicker>Memory graph</SlideKicker>
          </SlideReveal>
          <BlurWordsTitle lines={["Context as a living graph."]} size="xl" />
          <SlideReveal step={1} className="mt-6">
            <SlideBody>
              Memories are nodes. Tags are recurring themes. Entities are named
              specifics — people, projects, tools. Relates-to edges connect
              memories by content, session, and similarity.
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
            Click a node during the talk.
          </p>
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
