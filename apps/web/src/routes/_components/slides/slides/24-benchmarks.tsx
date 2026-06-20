import { IconQuote } from "@tabler/icons-react";
import { motion } from "motion/react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

const COMPETITORS = [
  { name: "Supermemory", logo: "/slides/logo-supermemory.svg" },
  { name: "Mem0", logo: "/slides/logo-mem0.svg" },
] as const;

/** Square logo chip, matching the comparison slide's brand columns. */
function LogoChip({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">
      <img src={src} alt={alt} className="h-5 w-5" draggable={false} />
    </span>
  );
}

/** Pulsing "running" dot for the in-progress benchmark rows. */
function RunningDot() {
  return (
    <motion.span
      className="h-1.5 w-1.5 rounded-full bg-foreground/50"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function Slide24Benchmarks() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Benchmarks &amp; results</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The numbers are coming."]} size="xl" />

      {/* Step 1 — formal benchmarking, honestly in progress */}
      <SlideStagger
        className="mt-8 grid grid-cols-2 gap-5"
        delayChildren={0.06}
        staggerChildren={0.14}
        step={1}
      >
        {COMPETITORS.map(({ name, logo }) => (
          <SlideItem key={name}>
            <div className="flex items-center justify-between rounded-2xl bg-surface-secondary/60 px-5 py-4">
              <div className="flex items-center gap-2.5">
                {/* vmem icon is a filled square app icon — fill the chip. */}
                <img
                  src="/icon.png"
                  alt="vmem"
                  className="h-8 w-8 shrink-0 rounded-lg"
                  draggable={false}
                />
                <span className="text-sm text-muted">vs</span>
                <LogoChip src={logo} alt={name} />
                <p className="text-lg font-medium text-foreground">{name}</p>
              </div>
              <span className="flex items-center gap-2 text-xs font-medium text-muted">
                <RunningDot />
                Benchmarking
              </span>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
      <SlideReveal step={1} delay={0.2} className="mt-3">
        <p className="text-sm text-muted">
          Formal results on recall quality, latency, and token cost are in
          progress.
        </p>
      </SlideReveal>

      {/* Step 2 — the real proof today: personal daily use */}
      <SlideReveal step={2} className="mt-6">
        <div className="flex gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
          <IconQuote size={26} stroke={1.5} className="shrink-0 opacity-60" />
          <div>
            <p className="text-base leading-relaxed">
              I&rsquo;ve been running vmem on my own Claude and ChatGPT
              subscriptions for weeks. Having all my data accessible anywhere
              has been genuinely amazing.
            </p>
            <p className="mt-2 text-sm opacity-60">From daily personal use</p>
          </div>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
