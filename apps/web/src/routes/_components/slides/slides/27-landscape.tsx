import {
  IconSearch,
  IconHierarchy2,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideBody,
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Approach {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const APPROACHES: Approach[] = [
  {
    icon: IconSearch,
    title: "Search & paste",
    body: "Find a few notes that look similar, and paste them in for the AI to read.",
  },
  {
    icon: IconHierarchy2,
    title: "Connected search",
    body: "Map how things relate first, then pull in the connected pieces too.",
  },
  {
    icon: IconAdjustmentsHorizontal,
    title: "The right context",
    body: "Hand the AI exactly the right facts, in the right order — nothing spare.",
  },
];

export function Slide27Landscape() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The landscape</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["How others tackle this."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {APPROACHES.map(({ icon: Icon, title, body }) => (
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

      <SlideReveal step={2} className="mt-7 max-w-3xl">
        <SlideBody>
          AI thinks well — it struggles to find the right information. It all
          comes down to context. Get it right and answers get more accurate{" "}
          <span className="font-medium text-foreground">and</span> cheaper,
          every time.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
