import {
  IconMoonStars,
  IconAlertTriangle,
  IconGitMerge,
  IconUser,
} from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
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
      <SlideReveal delay={0.08} className="mt-4 max-w-2xl">
        <SlideBody>
          After enough new memories pile up, vmem runs a background pass. It
          looks for conflicts, duplicates saying the same thing, and patterns
          across everything you have captured.
        </SlideBody>
      </SlideReveal>

      <SlideStagger className="mt-8 space-y-4" delayChildren={0.08} step={1}>
        {dreamOutputs.map(({ icon: Icon, kind, example }) => (
          <SlideItem key={kind}>
            <div className="flex gap-4 rounded-2xl bg-surface-secondary/60 px-5 py-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={15} stroke={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{kind}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {example}
                </p>
              </div>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal
        step={2}
        className="mt-6 rounded-2xl bg-surface-secondary/40 px-5 py-4"
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <IconMoonStars size={14} stroke={1.5} />
          <span>
            Runs when you have been quiet for 30 minutes and at least 5 new
            memories. Up to 4 times a day. It proposes changes — never silently
            overwrites.
          </span>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
