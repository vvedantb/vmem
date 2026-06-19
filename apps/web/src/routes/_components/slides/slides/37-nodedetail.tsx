import type { ReactNode } from "react";
import { IconClockHour4, IconLink, IconX } from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Mock of the web app: clicking a node in the memory graph opens the detail
 * panel on the right. Left = the graph with the selected node highlighted;
 * right = the panel with Details/History/Connections tabs, a history timeline,
 * and a connections list. All mock data.
 */

const CENTER = { l: 50, t: 50 };
const NEIGHBOURS = [
  { l: 18, t: 22, label: "Clerk MV3 setup" },
  { l: 80, t: 26, label: "SW offline bug" },
  { l: 20, t: 80, label: "Auth0 → Clerk" },
  { l: 82, t: 76, label: "Token refresh" },
] as const;

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
    body: "Linked to “Token refresh” — same auth migration.",
  },
  {
    when: "5d ago",
    action: "Updated",
    actorClass: "bg-default text-default-foreground",
    actor: "you",
    body: "Confirmed Clerk over Auth0 for MV3 support.",
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
  { title: "Token refresh", reason: "depends on" },
  { title: "SW offline bug", reason: "caused" },
  { title: "Auth0 → Clerk", reason: "because" },
];

function At({ l, t, children }: { l: number; t: number; children: ReactNode }) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${l}%`, top: `${t}%` }}
    >
      {children}
    </div>
  );
}

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

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[1fr_440px] gap-8">
        {/* Left — the graph, with the selected node highlighted */}
        <div className="relative">
          <svg
            className="absolute inset-0 h-full w-full text-foreground/25"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            {NEIGHBOURS.map((n) => (
              <line
                key={n.label}
                x1={CENTER.l}
                y1={CENTER.t}
                x2={n.l}
                y2={n.t}
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {NEIGHBOURS.map((n) => (
            <At key={n.label} l={n.l} t={n.t}>
              <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-secondary/70 px-3 py-1.5 opacity-60">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
                <span className="text-xs text-foreground/80">{n.label}</span>
              </div>
            </At>
          ))}
          {/* Selected node — ringed + glow */}
          <At l={CENTER.l} t={CENTER.t}>
            <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-background shadow-[0_0_0_4px_color-mix(in_oklch,var(--foreground)_18%,transparent)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-background" />
              <span className="text-sm font-medium">Migrate auth to Clerk</span>
            </div>
          </At>
        </div>

        {/* Right — the detail panel (mirrors MemoryDetailPanel) */}
        <SlideReveal>
          <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                Migrate auth to Clerk
              </h3>
              <IconX size={16} className="mt-0.5 shrink-0 text-muted" />
            </div>
            <div className="mt-3 inline-flex gap-1 self-start rounded-xl bg-surface-secondary/70 p-1">
              <Tab label="Details" />
              <Tab label="History" active />
              <Tab label="Connections" />
            </div>

            {/* Timeline */}
            <div className="mt-5">
              <SectionLabel icon={<IconClockHour4 size={13} stroke={1.5} />}>
                Timeline
              </SectionLabel>
              <SlideStagger
                className="relative space-y-4 pl-6"
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
                        <span className="text-xs text-muted">by {e.actor}</span>
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
            <div className="mt-6">
              <SectionLabel icon={<IconLink size={13} stroke={1.5} />}>
                Connections
              </SectionLabel>
              <SlideStagger
                className="space-y-2"
                delayChildren={0.1}
                staggerChildren={0.12}
                step={2}
              >
                {CONNECTIONS.map((c) => (
                  <SlideItem key={c.title}>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-secondary/70 px-4 py-2.5">
                      <span className="text-sm text-foreground">{c.title}</span>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                        {c.reason}
                      </span>
                    </div>
                  </SlideItem>
                ))}
              </SlideStagger>
            </div>
          </div>
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
