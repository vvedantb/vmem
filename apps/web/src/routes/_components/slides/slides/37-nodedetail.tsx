import type { ReactNode } from "react";
import { IconClockHour4, IconLink } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Mock of the web app's memory detail panel — what opens when you click a node.
 * Replicates the Details/History/Connections tabs, a history timeline, and a
 * connections list. All mock data; not wired to anything.
 */

interface TimelineEvent {
  when: string;
  action: string;
  actorClass: string;
  actor: string;
  body: string;
}

const TIMELINE: TimelineEvent[] = [
  {
    when: "2d ago",
    action: "Updated",
    actorClass: "bg-default text-default-foreground",
    actor: "dream-mode",
    body: "Linked to “Extension token refresh” — same auth migration.",
  },
  {
    when: "5d ago",
    action: "Updated",
    actorClass: "bg-default text-default-foreground",
    actor: "you",
    body: "Confirmed: Clerk over Auth0 for MV3 service-worker support.",
  },
  {
    when: "12d ago",
    action: "Created",
    actorClass: "bg-success/15 text-success",
    actor: "Claude",
    body: "Decided to migrate auth to Clerk.",
  },
];

const CONNECTIONS = [
  { title: "Extension token refresh", reason: "depends on" },
  { title: "SW offline bug", reason: "caused" },
  { title: "Prefers Clerk over Auth0", reason: "because" },
];

function Tab({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active ? "bg-surface text-foreground" : "text-muted"
      }`}
    >
      {label}
    </span>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
      {icon}
      {children}
    </p>
  );
}

export function Slide37NodeDetail() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Click any node</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Every memory, fully traceable."]} size="xl" />

      <div className="mt-5 flex justify-center">
        {/* The detail panel card — mirrors MemoryDetailPanel */}
        <SlideReveal className="w-full max-w-3xl">
          <div className="rounded-2xl bg-surface-secondary/50 p-6">
            {/* Header */}
            <h3 className="text-lg font-semibold text-foreground">
              Migrate auth to Clerk
            </h3>
            {/* Tabs */}
            <div className="mt-3 inline-flex gap-1 rounded-xl bg-surface-secondary/70 p-1">
              <Tab label="Details" />
              <Tab label="History" active />
              <Tab label="Connections" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-8">
              {/* History timeline */}
              <div>
                <SectionLabel icon={<IconClockHour4 size={13} stroke={1.5} />}>
                  Timeline
                </SectionLabel>
                <SlideStagger
                  className="relative space-y-5 pl-6"
                  delayChildren={0.1}
                  staggerChildren={0.12}
                  step={1}
                >
                  <div className="absolute bottom-1 left-[5px] top-1 w-px bg-separator/50" />
                  {TIMELINE.map((e) => (
                    <SlideItem key={e.when + e.body}>
                      <div className="relative">
                        <span className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground/50" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">{e.when}</span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${e.actorClass}`}
                          >
                            {e.action}
                          </span>
                          <span className="text-xs text-muted">
                            by {e.actor}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-snug text-foreground/85">
                          {e.body}
                        </p>
                      </div>
                    </SlideItem>
                  ))}
                </SlideStagger>
              </div>

              {/* Connections */}
              <div>
                <SectionLabel icon={<IconLink size={13} stroke={1.5} />}>
                  Connections
                </SectionLabel>
                <SlideStagger
                  className="space-y-2.5"
                  delayChildren={0.1}
                  staggerChildren={0.12}
                  step={2}
                >
                  {CONNECTIONS.map((c) => (
                    <SlideItem key={c.title}>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-secondary/70 px-4 py-3">
                        <span className="text-sm text-foreground">
                          {c.title}
                        </span>
                        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                          {c.reason}
                        </span>
                      </div>
                    </SlideItem>
                  ))}
                </SlideStagger>
              </div>
            </div>
          </div>
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
