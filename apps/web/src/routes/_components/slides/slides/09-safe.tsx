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
    body: "Conflicts never silently overwrite. vmem surfaces a proposal — you approve or reject. Your memories stay accurate.",
  },
  {
    icon: IconPin,
    title: "Pin",
    body: "Pin a memory so it can't be changed, hidden, or touched when vmem reorganises overnight.",
  },
  {
    icon: IconEyeOff,
    title: "Hide",
    body: "Stop a memory showing up without deleting it. Useful when something is wrong or no longer relevant.",
  },
  {
    icon: IconClock,
    title: "Expire",
    body: "Give a memory an expiry date. Temporary things — meeting prep, event notes — vanish when no longer needed.",
  },
  {
    icon: IconActivity,
    title: "History",
    body: "Every change is recorded — what changed, where it came from, when, and why.",
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
          Memory should not be a black box. vmem gives you full control —
          approve, pin, hide, expire, and a clear history of every change.
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
