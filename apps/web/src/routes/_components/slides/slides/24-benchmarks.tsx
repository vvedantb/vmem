import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideBody,
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Real Chapter 5 retrieval-benchmark results, told for a non-technical room:
 * four intuitive headline numbers, then an honest scope/caveat line (controlled
 * internal benchmark, not a public head-to-head with Mem0/Supermemory).
 */

interface Metric {
  value: string;
  label: string;
}

const METRICS: Metric[] = [
  {
    value: "93%",
    label: "of the time, the right memory was in the top 5 results",
  },
  {
    value: "58×",
    label: "less context sent to the model than dumping it all in",
  },
  {
    value: "~0.2s",
    label: "to find the right memories, typically",
  },
  {
    value: "6/6",
    label: "behaviour tests passed — dedup, pin, suppress, trace, update",
  },
];

export function Slide24Benchmarks() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Benchmarks &amp; results</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The numbers are in."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-4 gap-4"
        delayChildren={0.06}
        staggerChildren={0.12}
        step={1}
      >
        {METRICS.map(({ value, label }) => (
          <SlideItem key={value}>
            <div className="flex h-full flex-col gap-2 rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <p className="font-instrumentSerif text-5xl leading-none text-foreground">
                {value}
              </p>
              <p className="text-sm leading-snug text-muted">{label}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal step={2} className="mt-7 max-w-3xl">
        <SlideBody>
          That&rsquo;s from a controlled test — 488 memories and 78 questions,
          each with the right answer labelled by hand — where it also hit 95% in
          the top ten and ranked the most useful memories near the top.
          It&rsquo;s an honest internal benchmark, mind — not a public
          head-to-head with Mem0 or Supermemory yet.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
