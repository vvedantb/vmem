import { IconKey, IconPlugConnected, IconCpu } from "@tabler/icons-react";
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

interface Moat {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const MOATS: Moat[] = [
  {
    icon: IconKey,
    title: "You own the memories",
    body: "Your data is yours — portable, exportable, never held hostage by a provider.",
  },
  {
    icon: IconPlugConnected,
    title: "Plug and play across providers",
    body: "One memory layer that works with Claude, ChatGPT, and whatever comes next.",
  },
  {
    icon: IconCpu,
    title: "Runs on local models",
    body: "Private answers on your own devices — not tied to any one company.",
  },
];

export function Slide31Defensibility() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why vmem holds</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["What keeps vmem defensible."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {MOATS.map(({ icon: Icon, title, body }) => (
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
          The labs may get faster — but they can&rsquo;t give you{" "}
          <span className="font-medium text-foreground">
            ownership, portability, and independence
          </span>
          .
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
