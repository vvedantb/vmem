import type { ComponentType } from "react";
import { IconPin, IconEyeOff, IconClock } from "@tabler/icons-react";
import { IconInbox, IconActivity } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

/** Minimal icon props that both @tabler/icons-react and sidebar icons satisfy. */
interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface SafetyFeature {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const safetyFeatures: SafetyFeature[] = [
  {
    icon: IconInbox,
    title: "Proposed updates",
    body: "Approve or reject — never silent overwrites.",
  },
  {
    icon: IconPin,
    title: "Pin",
    body: "Lock a memory so nothing can change it.",
  },
  {
    icon: IconEyeOff,
    title: "Hide",
    body: "Stop it showing up, without deleting it.",
  },
  {
    icon: IconClock,
    title: "Expire",
    body: "Set an expiry for temporary things.",
  },
  {
    icon: IconActivity,
    title: "History",
    body: "Every change recorded — what, when, why.",
  },
];

export function Slide09Safe() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Safe by design</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["You stay in control."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-4 max-w-2xl">
        <SlideBody>
          Memory should not be a black box. You stay in control.
        </SlideBody>
      </SlideReveal>

      <SlideStagger
        className="mt-8 grid grid-cols-5 gap-4"
        delayChildren={0.07}
        step={1}
      >
        {safetyFeatures.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={15} stroke={1.5} />
              </div>
              <p className="mb-1.5 text-sm font-medium text-foreground">
                {title}
              </p>
              <p className="text-[11px] leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
    </SlideShell>
  );
}
