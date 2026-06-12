import {
  IconMoonStars,
  IconAlertTriangle,
  IconGitMerge,
  IconUser,
} from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const dreamOutputs = [
  {
    icon: IconAlertTriangle,
    kind: "Contradiction",
    example:
      '"Uses vim" conflicts with "switched to VS Code last month" — approve a winner.',
  },
  {
    icon: IconGitMerge,
    kind: "Merge proposal",
    example:
      '"Neo4j sync lag" and "graph latency issue" are near-duplicates — consolidate?',
  },
  {
    icon: IconUser,
    kind: "Portrait",
    example:
      "Inferred from 40 memories: backend-focused, prefers concise replies, active evenings.",
  },
];

export function Slide08Dream() {
  return (
    <SlideShell>
      <SlideKicker>Dream Mode</SlideKicker>
      <SlideTitle size="xl">Proactive memory intelligence.</SlideTitle>
      <div className="mt-4 max-w-2xl">
        <SlideBody>
          Runs automatically after you accumulate enough new memories. While you
          are away, vmem analyses the graph for contradictions, near-duplicates,
          and emerging patterns.
        </SlideBody>
      </div>

      <div className="mt-8 space-y-4">
        {dreamOutputs.map(({ icon: Icon, kind, example }) => (
          <div
            key={kind}
            className="flex gap-4 rounded-2xl bg-surface-secondary/60 px-5 py-4"
          >
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
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-surface-secondary/40 px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <IconMoonStars size={14} stroke={1.5} />
          <span>
            Auto-triggers when quiet 30 min + ≥ 5 new memories. Capped at 4 runs
            per day. Never overwrites — always proposes.
          </span>
        </div>
      </div>
    </SlideShell>
  );
}
