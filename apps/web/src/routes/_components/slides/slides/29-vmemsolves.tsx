import { IconMoon, IconShare2, IconRefresh } from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
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

interface Solution {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const SOLUTIONS: Solution[] = [
  {
    icon: IconMoon,
    title: "Dream Mode",
    body: "Nightly processing of new memories — forms fresh connections and fades the importance of irrelevant ones.",
  },
  {
    icon: IconShare2,
    title: "Relationship-first recall",
    body: "Retrieves memories by how they connect, not just by surface similarity.",
  },
  {
    icon: IconRefresh,
    title: "Always in sync",
    body: "Connectors stream your data in continuously, wiring it into the graph as it arrives.",
  },
];

export function Slide29VmemSolves() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The vmem answer</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["How vmem solves it."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {SOLUTIONS.map(({ icon: Icon, title, body }) => (
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
        <p className="text-lg leading-relaxed text-foreground/80">
          Memory that{" "}
          <span className="font-medium text-foreground">
            connects, adapts, and stays current
          </span>{" "}
          — not a static store.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
