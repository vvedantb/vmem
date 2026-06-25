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
      '"Uses vim" conflicts with "switched to VS Code last month" — you pick which one wins.',
  },
  {
    icon: IconGitMerge,
    kind: "Merge proposal",
    example:
      '"Database slow" and "graph feels laggy" look like the same issue — merge them?',
  },
  {
    icon: IconUser,
    kind: "Portrait",
    example:
      "From 40 memories: you work on backend, like short answers, active in the evenings.",
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
          After enough new memories pile up, vmem runs a background pass. It
          looks for conflicts, duplicates saying the same thing, and patterns
          across everything you have captured.
        </SlideBody>
      </SlideReveal>

      <DreamModePanel outputs={dreamOutputs} />
    </SlideShell>
  );
}
