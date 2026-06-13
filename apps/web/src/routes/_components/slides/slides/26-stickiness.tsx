import { IconChevronDown, IconArrowsExchange } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

const PORTABLE = ["Skills", "About you", "Connectors"] as const;

const SPIRAL = [
  "The more you use Claude, the more you personalise everything around it.",
  "The deeper you risk getting locked into its ecosystem.",
] as const;

export function Slide26Stickiness() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The trade-off</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The cost of stickiness."]} size="xl" />

      {/* Step 1 — the lock-in spiral, escalating downward */}
      <SlideStagger
        className="mt-8 flex flex-col gap-3"
        delayChildren={0.06}
        staggerChildren={0.18}
        step={1}
      >
        {SPIRAL.map((line, i) => (
          <SlideItem key={line}>
            <div className="flex flex-col gap-3">
              {i > 0 ? (
                <IconChevronDown
                  size={18}
                  stroke={1.5}
                  className="ml-5 text-muted/50"
                />
              ) : null}
              <div className="max-w-3xl rounded-2xl bg-surface-secondary/60 px-5 py-4">
                <p className="text-base leading-relaxed text-foreground">
                  {line}
                </p>
              </div>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      {/* Step 2 — the resolution: configs should be portable */}
      <SlideReveal step={2} className="mt-7">
        <div className="flex items-center gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
          <IconArrowsExchange size={26} stroke={1.5} className="shrink-0" />
          <p className="flex-1 text-base leading-relaxed">
            Anything you configure should be easy to move elsewhere.
          </p>
          <div className="flex shrink-0 gap-2">
            {PORTABLE.map((name) => (
              <span
                key={name}
                className="rounded-full bg-background/15 px-3 py-1 text-sm font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
