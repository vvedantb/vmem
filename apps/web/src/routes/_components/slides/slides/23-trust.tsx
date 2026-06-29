import { IconKey, IconLock, IconDeviceMobile } from "@tabler/icons-react";
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

interface TrustPillar {
  icon: ComponentType<IconProps>;
  title: string;
  points: string[];
}

const PILLARS: TrustPillar[] = [
  {
    icon: IconKey,
    title: "You own your data",
    points: [
      "View all your memories",
      "Modify or delete anytime",
      "Open source — run it yourself",
    ],
  },
  {
    icon: IconLock,
    title: "Private by default",
    points: [
      "Encrypted by default",
      "Enabled out of the box",
      "Your memories stay private",
    ],
  },
  {
    icon: IconDeviceMobile,
    title: "Runs on your devices",
    points: [
      "Works without the cloud",
      "Phone app runs on your phone",
      "No internet required",
      "Laptop models will rival Opus soon",
    ],
  },
];

export function Slide23Trust() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Trust</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Why you can trust vmem."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {PILLARS.map(({ icon: Icon, title, points }) => (
          <SlideItem key={title}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={19} stroke={1.5} />
              </div>
              <p className="mb-3 text-base font-medium text-foreground">
                {title}
              </p>
              <ul className="space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                    <span className="text-sm leading-snug text-muted">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
    </SlideShell>
  );
}
