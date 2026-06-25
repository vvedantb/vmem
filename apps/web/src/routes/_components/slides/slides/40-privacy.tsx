import type { ComponentType } from "react";
import {
  IconLock,
  IconServer,
  IconTrendingUp,
  IconShieldLock,
} from "@tabler/icons-react";
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
 * Why local models matter beyond cost: whole industries can't put their data
 * into a third-party AI cloud (privacy, compliance, data residency). Local
 * models keep data on their own servers — and as open models close the gap,
 * that unlocks frontier-grade intelligence privately. (Sources: enterprise
 * AI data-security coverage — see /goal research notes.)
 */

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Beat {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const BEATS: Beat[] = [
  {
    icon: IconLock,
    title: "The blocker",
    body: "Banks, hospitals, law firms, government — privacy and compliance rules forbid sending customer, patient or case data to a third-party AI. Claude and ChatGPT are off the table.",
  },
  {
    icon: IconServer,
    title: "The unlock",
    body: "A local model runs on the company's own servers. Every prompt and answer stays inside their walls — nothing leaves, nothing trains anyone else's model.",
  },
  {
    icon: IconTrendingUp,
    title: "The trajectory",
    body: "Open models keep closing the gap with the frontier labs. Soon that same power arrives — and it stays completely private.",
  },
];

export function Slide40Privacy() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why local matters</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Some data can never leave."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-4 max-w-3xl">
        <SlideBody>
          Many companies can&rsquo;t use Claude or ChatGPT at all — not by
          choice, but because the rules forbid their data ever leaving their own
          servers.
        </SlideBody>
      </SlideReveal>

      {/* Step 1 — blocker → unlock → trajectory */}
      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.12}
        step={1}
      >
        {BEATS.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={17} stroke={1.5} />
              </div>
              <p className="mb-1.5 text-base font-medium text-foreground">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      {/* Step 2 — the payoff */}
      <SlideReveal step={2} className="mt-6">
        <div className="flex items-center gap-4 rounded-2xl bg-foreground px-6 py-5 text-background">
          <IconShieldLock size={26} stroke={1.5} className="shrink-0" />
          <p className="flex-1 text-base leading-relaxed">
            Local models unlock frontier intelligence with{" "}
            <span className="font-semibold">
              zero data leaving the building
            </span>{" "}
            — and vmem already runs on them, on-device.
          </p>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
