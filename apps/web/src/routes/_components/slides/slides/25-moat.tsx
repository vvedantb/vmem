import {
  IconChevronsDown,
  IconCopy,
  IconFingerprint,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { PollCallback } from "../_components/PollCallback";
import { POLL_STICKINESS } from "../_components/pollDefs";
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

interface Argument {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const ARGUMENTS: Argument[] = [
  {
    icon: IconChevronsDown,
    title: "Models converge",
    body: "The best models' improvements spread over time — everyone catches up.",
  },
  {
    icon: IconCopy,
    title: "Software is copyable",
    body: "Tools like Cowork and Claude Code are easy to replicate. No lasting edge there.",
  },
  {
    icon: IconFingerprint,
    title: "Memory is what's left",
    body: "The real differentiator is personalisation and personality — driven by the data they hold on you.",
  },
];

export function Slide25Moat() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The thesis</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Memory is the moat."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.14}
        step={1}
      >
        {ARGUMENTS.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-6">
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

      <SlideReveal step={2} className="mt-7">
        <p className="max-w-3xl text-lg leading-relaxed text-foreground/80">
          Whoever holds your memories owns the relationship. With vmem,{" "}
          <span className="font-medium text-foreground">that&rsquo;s you</span>{" "}
          — not the lab.
        </p>
      </SlideReveal>

      <SlideReveal step={2} delay={0.15} className="mt-5">
        <PollCallback poll={POLL_STICKINESS} prefix="You just told me" />
      </SlideReveal>
    </SlideShell>
  );
}
