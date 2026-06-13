import {
  IconBrain,
  IconCpu,
  IconCurrencyPound,
  IconDeviceLaptop,
  IconDeviceMobile,
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

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Trend {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const TRENDS: Trend[] = [
  {
    icon: IconBrain,
    title: "Getting smarter, fast",
    body: "Open models close the gap with frontier labs every few months.",
  },
  {
    icon: IconDeviceMobile,
    title: "Already on phones",
    body: "Small models run on-device today — private, offline, instant.",
  },
];

export function Slide18Local() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The shift</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Models are going local."]} size="xl" />

      {/* Step 1 — the two trends */}
      <SlideStagger
        className="mt-8 grid grid-cols-2 gap-5"
        delayChildren={0.06}
        staggerChildren={0.12}
        step={1}
      >
        {TRENDS.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={17} stroke={1.5} />
              </div>
              <p className="mb-1 text-base font-medium text-foreground">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      {/* Step 2 — Opus-level local, but expensive today */}
      <SlideReveal step={2} className="mt-5">
        <div className="flex items-center gap-5 rounded-2xl bg-foreground px-6 py-5 text-background">
          <IconCpu size={28} stroke={1.5} className="shrink-0" />
          <div className="flex-1">
            <p className="text-base font-medium">
              An Opus-level model already runs locally — today.
            </p>
            <p className="mt-1 text-sm opacity-70">
              The catch: it needs serious GPUs to run.
            </p>
          </div>
          <div className="flex items-center gap-1 text-2xl font-medium">
            <IconCurrencyPound size={22} stroke={1.5} />
            <span className="tabular-nums">~4,000</span>
          </div>
        </div>
      </SlideReveal>

      {/* Step 3 — the inevitability */}
      <SlideReveal step={3} className="mt-5">
        <div className="flex items-start gap-3">
          <IconDeviceLaptop
            size={20}
            stroke={1.5}
            className="mt-0.5 shrink-0 text-muted"
          />
          <p className="max-w-3xl text-base leading-relaxed text-foreground/80">
            Soon every laptop ships with a capable model inside it. Models will
            be <span className="font-medium text-foreground">everywhere</span> —
            we won&rsquo;t just be talking to Claude or ChatGPT.
          </p>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
