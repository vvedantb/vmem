import {
  IconHeadset,
  IconStethoscope,
  IconChartLine,
  IconTrendingUp,
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

interface UseCase {
  icon: ComponentType<IconProps>;
  domain: string;
  points: string[];
}

const USE_CASES: UseCase[] = [
  {
    icon: IconHeadset,
    domain: "Customer support",
    points: [
      "Recalls full customer history",
      "Tailored replies, no repeated questions",
      "Never re-litigates past issues",
    ],
  },
  {
    icon: IconStethoscope,
    domain: "Healthcare",
    points: [
      "Patient context across every visit",
      "Recalls history and medications",
      "Continuity between clinicians",
    ],
  },
  {
    icon: IconChartLine,
    domain: "Finance",
    points: [
      "Client goals and risk profile",
      "Context-aware advice",
      "Decisions grounded in history",
    ],
  },
  {
    icon: IconTrendingUp,
    domain: "Sales",
    points: [
      "Remembers every account",
      "Personalised outreach",
      "Picks up where the last rep left off",
    ],
  },
];

export function Slide19UseCases() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>In the field</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One memory, every team."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-4 gap-4"
        delayChildren={0.06}
        staggerChildren={0.12}
        step={1}
      >
        {USE_CASES.map(({ icon: Icon, domain, points }) => (
          <SlideItem key={domain}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={17} stroke={1.5} />
              </div>
              <p className="mb-3 text-base font-medium text-foreground">
                {domain}
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
