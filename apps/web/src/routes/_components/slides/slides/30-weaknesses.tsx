import {
  IconHourglassLow,
  IconGauge,
  IconTrendingUp,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideReferences } from "../_components/SlideReferences";
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

interface Weakness {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const WEAKNESSES: Weakness[] = [
  {
    icon: IconHourglassLow,
    title: "Answers can be slower",
    body: "Following all those connections takes a moment — it isn't instant.",
  },
  {
    icon: IconGauge,
    title: "Not the fastest",
    body: "Simpler tools built only for speed can look things up quicker.",
  },
  {
    icon: IconTrendingUp,
    title: "The labs are catching up",
    body: "Claude and ChatGPT memory will improve over the next 6 months — vmem is great now, but may not stay the best.",
  },
];

export function Slide30Weaknesses() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Being honest</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Where vmem falls short."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {WEAKNESSES.map(({ icon: Icon, title, body }) => (
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

      <SlideReferences
        className="mt-auto"
        items={[
          {
            label: "ChatGPT memory · OpenAI",
            href: "https://openai.com/index/chatgpt-memory-dreaming/",
          },
          {
            label: "Self-improving memory · Perplexity",
            href: "https://www.perplexity.ai/hub/blog/self-improving-memory-for-agents",
          },
          {
            label: "Agent dreams · Claude",
            href: "https://platform.claude.com/docs/en/managed-agents/dreams",
          },
        ]}
      />
    </SlideShell>
  );
}
