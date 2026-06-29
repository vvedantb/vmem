import { IconAlertTriangle, IconGitMerge, IconUser } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { DreamModePanel } from "../_components/DreamModePanel";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

const dreamOutputs = [
  {
    icon: IconAlertTriangle,
    kind: "Contradiction",
    example:
      '"Works from home Fridays" conflicts with "back in the office full-time" — you pick which one wins.',
  },
  {
    icon: IconGitMerge,
    kind: "Merge proposal",
    example:
      '"Loved the Rome trip" and "Italy was amazing" look like the same thing — merge them?',
  },
  {
    icon: IconUser,
    kind: "Portrait",
    example:
      "From 40 memories: you lead the marketing team, prefer short updates, and work best in the mornings.",
  },
];

export function Slide08Dream() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Dream Mode</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Your memories get smarter overnight."]}
        size="xl"
      />
      <SlideReveal delay={0.08} className="mt-3 max-w-2xl">
        <SlideBody className="text-base text-foreground">
          While you're away, vmem revisits your memories and tidies them up.
        </SlideBody>
      </SlideReveal>

      <DreamModePanel outputs={dreamOutputs} />
    </SlideShell>
  );
}
