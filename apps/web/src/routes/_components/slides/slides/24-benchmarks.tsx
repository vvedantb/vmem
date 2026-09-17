import {
  IconTrendingDown,
  IconTargetArrow,
  IconQuote,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Deliberately qualitative — early internal testing only, no hard numbers and
 * no competitor comparison (that invites scrutiny the results can't back yet).
 * Two plain signals, then a short first-person callout.
 */

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Signal {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const SIGNALS: Signal[] = [
  {
    icon: IconTrendingDown,
    title: "Far fewer tokens",
    body: "It only sends the model the memories that matter — so each question costs a fraction of what it otherwise would.",
  },
  {
    icon: IconTargetArrow,
    title: "The right memories",
    body: "When I ask it something, it pulls back the correct memories the large majority of the time.",
  },
];

export function Slide24Benchmarks() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Early results</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The early signs are good."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-2 gap-5"
        delayChildren={0.06}
        staggerChildren={0.14}
        step={1}
      >
        {SIGNALS.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={19} stroke={1.5} />
              </div>
              <p className="mb-1.5 text-base font-medium text-foreground">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal step={2} className="mt-6">
        <div className="flex max-w-3xl gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
          <IconQuote size={26} stroke={1.5} className="shrink-0 opacity-50" />
          <div>
            <p className="text-lg leading-snug">
              With everything in one place, nothing&rsquo;s invisible to Claude
              any more.
            </p>
            <p className="mt-2 text-sm opacity-60">
              From my personal usage — testing is still ongoing.
            </p>
          </div>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
