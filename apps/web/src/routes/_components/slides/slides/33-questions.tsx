import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

const QUESTIONS = [
  "Why do we have separate chats in ChatGPT?",
  "Why is ChatGPT's memory limited?",
  "How do I connect my data to memories?",
  "Why do I only have limited memories stored?",
  "Why can't the model learn, update, and delete irrelevant memories?",
  "How do we move memories between AI providers?",
  "How do we keep long chats accurate without the cost?",
] as const;

export function Slide33Questions() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The questions</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Everyone is already asking."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3"
        delayChildren={0.06}
        staggerChildren={0.11}
        step={1}
      >
        {QUESTIONS.map((q) => (
          <SlideItem key={q}>
            <div className="flex items-center gap-3 rounded-2xl bg-surface-secondary/60 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground font-instrumentSerif text-sm text-background">
                ?
              </span>
              <p className="text-sm leading-snug text-foreground">{q}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
    </SlideShell>
  );
}
