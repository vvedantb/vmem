import { IconBulb, IconDatabase, IconPlugConnected } from "@tabler/icons-react";
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

interface Pillar {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const PILLARS: Pillar[] = [
  {
    icon: IconBulb,
    title: "Every decision, with its reasoning",
    body: "Not just what was decided — the why behind it, preserved and queryable.",
  },
  {
    icon: IconDatabase,
    title: "All company data in one place",
    body: "Linear, SharePoint, docs, conversations — unified into one connected place.",
  },
  {
    icon: IconPlugConnected,
    title: "Open to every agent",
    body: "One shared memory any tool or teammate can access — humans and AI alike.",
  },
];

export function Slide20CompanyBrain() {
  return (
    <SlideShell center>
      <div className="flex w-full max-w-5xl flex-col items-center text-center">
        <SlideReveal delay={0}>
          <SlideKicker>The bigger picture</SlideKicker>
        </SlideReveal>
        <BlurWordsTitle lines={["The company brain."]} size="2xl" />
        <SlideReveal delay={0.1} className="mt-5 max-w-2xl">
          <SlideBody>
            One living memory for the whole organisation — every decision, every
            reason, every source — and a space any agent can think inside.
          </SlideBody>
        </SlideReveal>

        <SlideStagger
          className="mt-10 grid grid-cols-3 gap-5 text-left"
          delayChildren={0.06}
          staggerChildren={0.14}
          step={1}
        >
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <SlideItem key={title}>
              <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
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
      </div>
    </SlideShell>
  );
}
