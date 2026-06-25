import {
  IconEyeglass,
  IconDeviceWatch,
  IconRobot,
  IconUserScan,
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

interface FormFactor {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const FORM_FACTORS: FormFactor[] = [
  {
    icon: IconEyeglass,
    title: "AI glasses",
    body: "Context in your field of view — it already knows what you know.",
  },
  {
    icon: IconDeviceWatch,
    title: "AI watch",
    body: "Your memory on your wrist, answering before you finish asking.",
  },
  {
    icon: IconRobot,
    title: "Personal robots",
    body: "An assistant that arrives already understanding your world.",
  },
  {
    icon: IconUserScan,
    title: "Digital twin",
    body: "A model of you that reasons and acts on your behalf — grounded in everything you've stored.",
  },
];

export function Slide22FormFactors() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>What&rsquo;s next</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["New ways to connect."]} size="xl" />

      {/* Step 1 — the emerging form factors */}
      <SlideStagger
        className="mt-8 grid grid-cols-4 gap-4"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {FORM_FACTORS.map(({ icon: Icon, title, body }) => (
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

      {/* Step 2 — the punchline: nothing to rebuild */}
      <SlideReveal step={2} className="mt-6">
        <p className="max-w-3xl text-lg leading-relaxed text-foreground/80">
          Whatever comes next, you won&rsquo;t set it up from scratch. Connect
          vmem and{" "}
          <span className="font-medium text-foreground">
            all your data is already there
          </span>
          .
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
