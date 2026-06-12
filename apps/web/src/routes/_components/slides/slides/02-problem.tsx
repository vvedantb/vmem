import type { ComponentType } from "react";
import { IconRobot, IconMessageOff } from "@tabler/icons-react";
import { IconMemories } from "@/components/sidebar-icons";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
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

interface Pain {
  icon: ComponentType<IconProps>;
  heading: string;
  body: string;
}

const pains: Pain[] = [
  {
    icon: IconMessageOff,
    heading: "Every session starts from zero.",
    body: "Claude, GPT, Gemini — none of them remember who you are, what you built, or what you decided yesterday.",
  },
  {
    icon: IconMemories,
    heading: "Context is trapped per tool.",
    body: "Context you share in one tool never reaches another. You repeat yourself endlessly across Cursor, Claude, Slack, and your phone.",
  },
  {
    icon: IconRobot,
    heading: "Agents have no long-term memory.",
    body: "Automated workflows run blind — no institutional knowledge, no awareness of past decisions or recurring preferences.",
  },
];

export function Slide02Problem() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The problem</SlideKicker>
        <SlideTitle>AI tools forget everything.</SlideTitle>
      </SlideReveal>
      <SlideStagger
        className="mt-10 grid grid-cols-3 gap-6"
        delayChildren={0.06}
        step={1}
      >
        {pains.map(({ icon: Icon, heading, body }) => (
          <SlideItem key={heading}>
            <div className="flex flex-col gap-3 rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-foreground text-background">
                <Icon size={18} stroke={1.5} />
              </div>
              <p className="text-sm font-medium text-foreground">{heading}</p>
              <p className="text-xs leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
      <SlideReveal step={2} className="mt-8">
        <SlideBody>
          The AI landscape is fragmented. There is no memory layer that sits
          across all tools and keeps context alive.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
