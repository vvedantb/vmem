import { IconRobot, IconBrain, IconMessageOff } from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const pains = [
  {
    icon: IconMessageOff,
    heading: "Every session starts from zero.",
    body: "Claude, GPT, Gemini — none of them remember who you are, what you built, or what you decided yesterday.",
  },
  {
    icon: IconBrain,
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
      <SlideKicker>The problem</SlideKicker>
      <SlideTitle>AI tools forget everything.</SlideTitle>
      <div className="mt-10 grid grid-cols-3 gap-6">
        {pains.map(({ icon: Icon, heading, body }) => (
          <div
            key={heading}
            className="flex flex-col gap-3 rounded-2xl bg-surface-secondary/60 px-5 py-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-foreground text-background">
              <Icon size={18} stroke={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">{heading}</p>
            <p className="text-xs leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SlideBody>
          The AI landscape is fragmented. There is no memory layer that sits
          across all tools and keeps context alive.
        </SlideBody>
      </div>
    </SlideShell>
  );
}
