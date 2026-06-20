import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { IconClockHour4, IconLink, IconX } from "@tabler/icons-react";
import {
  Badge,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@vmem/ui";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

const TAB_CYCLE_MS = 2600;
// Click choreography: cursor glides in, presses the node, panel opens.
const CLICK_AT_MS = 1500;
const OPEN_AT_MS = 2050;

/** Classic OS pointer arrow, white-filled so it reads on the dark graph. */
function Cursor() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
      aria-hidden
    >
      <path
        d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13.5 Z"
        fill="white"
        stroke="black"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mock of the web app: clicking a node in the memory graph opens the detail
 * panel on the right. Left = the graph with the selected node highlighted;
 * right = the real Card + Tabs panel, whose active tab auto-cycles through
 * Details → History → Connections as the slide's build steps advance. All
 * mock data.
 */

const CENTER = { l: 50, t: 50 };

const SATELLITES = [
  { l: 24, t: 23, label: "Clerk MV3 setup" },
  { l: 77, t: 25, label: "SW offline bug" },
  { l: 21, t: 78, label: "Prefers Clerk over Auth0" },
  { l: 79, t: 75, label: "Extension token refresh" },
] as const;

const TAB_FOR_STEP = ["details", "history", "connections"] as const;

const TIMELINE = [
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
    body: "Confirmed Clerk over Auth0 for MV3 service-worker support.",
  },
  {
    when: "12d ago",
    action: "Created",
    actorClass: "bg-success/15 text-success",
    actor: "Claude",
    body: "Decided to migrate auth to Clerk.",
  },
] as const;

const CONNECTIONS = [
  { title: "Extension token refresh", reason: "depends on" },
  { title: "SW offline bug", reason: "caused" },
  { title: "Prefers Clerk over Auth0", reason: "because" },
] as const;

const TAGS = ["auth", "clerk", "chrome-extension", "decision"] as const;

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
  // Click choreography: cursor glides to the node (approach), presses it
  // (click), then the detail panel opens (open).
  const [phase, setPhase] = useState<"approach" | "click" | "open">("approach");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("click"), CLICK_AT_MS);
    const t2 = setTimeout(() => setPhase("open"), OPEN_AT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const clicked = phase === "click" || phase === "open";
  const open = phase === "open";

  // Active tab cycles Details → History → Connections endlessly.
  const [tabIndex, setTabIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setTabIndex((i) => (i + 1) % TAB_FOR_STEP.length),
      TAB_CYCLE_MS,
    );
    return () => clearInterval(id);
  }, []);
  const activeTab = TAB_FOR_STEP[tabIndex];

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Click any node</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Every memory, fully traceable."]} size="xl" />

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[1fr_440px] gap-8">
        {/* Left — the graph, selected node highlighted */}
        <div className="relative">
          <svg
            className="absolute inset-0 h-full w-full text-foreground/30"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            {SATELLITES.map((s) => (
              <line
                key={s.label}
                x1={CENTER.l}
                y1={CENTER.t}
                x2={s.l}
                y2={s.t}
                stroke="currentColor"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {SATELLITES.map((s) => (
            <At key={s.label} l={s.l} t={s.t}>
              <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-secondary px-4 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/60" />
                <span className="text-sm text-foreground/80">{s.label}</span>
              </div>
            </At>
          ))}
          {/* Click ripple — expands out of the node when pressed */}
          <At l={CENTER.l} t={CENTER.t}>
            <motion.span
              className="block h-10 w-10 rounded-full border-2 border-foreground/50"
              initial={false}
              animate={
                clicked
                  ? { scale: [0.4, 2.4], opacity: [0.7, 0] }
                  : { scale: 0.4, opacity: 0 }
              }
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </At>

          {/* The node — gains its selected ring/glow only once clicked */}
          <At l={CENTER.l} t={CENTER.t}>
            <motion.div
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-background"
              initial={false}
              animate={{
                scale: clicked ? [1, 0.92, 1] : 1,
                boxShadow: clicked
                  ? "0 0 0 5px color-mix(in oklch, var(--foreground) 20%, transparent)"
                  : "0 0 0 0px color-mix(in oklch, var(--foreground) 0%, transparent)",
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-background" />
              <span className="text-base font-medium">
                Migrate auth to Clerk
              </span>
            </motion.div>
          </At>

          {/* Cursor — glides in to the node, presses, then fades as panel opens */}
          <motion.div
            className="pointer-events-none absolute z-10"
            initial={{ left: "80%", top: "88%", opacity: 0 }}
            animate={{
              left: "49%",
              top: "49%",
              opacity: open ? 0 : 1,
              scale: clicked && !open ? 0.85 : 1,
            }}
            transition={{
              left: { duration: 1.4, ease: [0.4, 0, 0.2, 1] },
              top: { duration: 1.4, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: open ? 0.4 : 0.5, delay: open ? 0.1 : 0 },
              scale: { duration: 0.2 },
            }}
          >
            <Cursor />
          </motion.div>
        </div>

        {/* Right — the detail panel; slides in once the node is clicked */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0, x: open ? 0 : 28 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className="flex h-full flex-col p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                Migrate auth to Clerk
              </h3>
              <IconX size={16} className="mt-0.5 shrink-0 text-muted" />
            </div>

            <Tabs
              value={activeTab}
              className="mt-4 flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="self-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="connections">Connections</TabsTrigger>
              </TabsList>

              {/* Details */}
              <TabsContent value="details" className="mt-5">
                <div className="rounded-lg bg-surface-secondary p-4">
                  <p className="text-sm leading-relaxed text-foreground">
                    Decided to migrate auth to Clerk for the Chrome extension —
                    its service-worker token refresh works under MV3 where Auth0
                    did not.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {TAGS.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted">
                  <span className="text-muted">Created </span>
                  <span className="tabular-nums text-foreground">
                    12 Jun 2026
                  </span>
                  <span className="px-2 text-muted">·</span>
                  decision
                  <span className="px-2 text-muted">·</span>
                  Chat
                </p>
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-5">
                <SectionLabel icon={<IconClockHour4 size={13} stroke={1.5} />}>
                  Timeline
                </SectionLabel>
                <div className="relative space-y-4 pl-6">
                  <div className="absolute bottom-1 left-[5px] top-1 w-px bg-separator/60" />
                  {TIMELINE.map((e) => (
                    <div key={e.when + e.body} className="relative">
                      <span className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface-card bg-foreground/50" />
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
                  ))}
                </div>
              </TabsContent>

              {/* Connections */}
              <TabsContent value="connections" className="mt-5">
                <SectionLabel icon={<IconLink size={13} stroke={1.5} />}>
                  Connections
                </SectionLabel>
                <div className="space-y-2">
                  {CONNECTIONS.map((c) => (
                    <div
                      key={c.title}
                      className="flex items-center justify-between gap-3 rounded-xl bg-surface-secondary px-4 py-2.5"
                    >
                      <span className="text-sm text-foreground">{c.title}</span>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                        {c.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </motion.div>
      </div>
    </SlideShell>
  );
}
