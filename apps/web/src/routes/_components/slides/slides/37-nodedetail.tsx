import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
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

/**
 * Mock of the web app on a self-running loop:
 *  1. a cursor appears and clicks the memory node → the detail panel opens,
 *  2. the cursor disappears and the panel rotates through all three tabs
 *     (Details → History → Connections) on its own,
 *  3. the panel closes and the whole sequence repeats.
 * The cursor only ever shows for the node click — never on tab switches.
 * All mock data.
 */

// Cycle timeline (ms from the start of each loop).
const CLICK_AT = 1100; // cursor clicks the node, panel opens
const CURSOR_GONE_AT = 1700; // cursor fades away
const TAB_DWELL = 2000; // how long each tab is shown
const TAB1_AT = CURSOR_GONE_AT + TAB_DWELL;
const TAB2_AT = TAB1_AT + TAB_DWELL;
const PANEL_CLOSE_AT = TAB2_AT + TAB_DWELL;
const LOOP_AT = PANEL_CLOSE_AT + 900; // brief beat, then restart

const CENTER = { l: 50, t: 50 };

const SATELLITES = [
  { l: 24, t: 23, label: "Kyoto ryokan booked" },
  { l: 77, t: 25, label: "Loved the ramen in Shibuya" },
  { l: 21, t: 78, label: "Get a Suica card" },
  { l: 79, t: 75, label: "Prefers a window seat" },
] as const;

const TAB_IDS = ["details", "history", "connections"] as const;

const TIMELINE = [
  {
    when: "2d ago",
    action: "Updated",
    actorClass: "bg-default text-default-foreground",
    actor: "Dream Mode",
    body: "Linked to “Loved the ramen in Shibuya” — same trip.",
  },
  {
    when: "5d ago",
    action: "Updated",
    actorClass: "bg-default text-default-foreground",
    actor: "you",
    body: "Added the Kyoto leg and booked the ryokan.",
  },
  {
    when: "12d ago",
    action: "Created",
    actorClass: "bg-success/15 text-success",
    actor: "Claude",
    body: "Started planning the trip to Japan.",
  },
] as const;

const CONNECTIONS = [
  { title: "Kyoto ryokan booked", reason: "part of" },
  { title: "Get a Suica card", reason: "tip" },
  { title: "Loved the ramen in Shibuya", reason: "last time" },
] as const;

const TAGS = ["travel", "japan", "tokyo", "planning"] as const;

/** Classic OS pointer arrow, white-filled so it reads on the dark UI. */
function Cursor() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
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
  const [cursorVisible, setCursorVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  // Bumps when the node is clicked so the ripple remounts and replays.
  const [clickKey, setClickKey] = useState(0);

  // Self-running loop: click node → open → rotate tabs → close → repeat.
  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const at = (fn: () => void, ms: number) => {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    const runCycle = () => {
      setCursorVisible(true);
      setPanelOpen(false);
      setTabIndex(0);

      at(() => {
        setClickKey((k) => k + 1); // ripple on the node
        setPanelOpen(true); // panel opens on Details
      }, CLICK_AT);
      at(() => setCursorVisible(false), CURSOR_GONE_AT);
      at(() => setTabIndex(1), TAB1_AT); // History
      at(() => setTabIndex(2), TAB2_AT); // Connections
      at(() => setPanelOpen(false), PANEL_CLOSE_AT);
      at(runCycle, LOOP_AT);
    };
    runCycle();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const activeTab = TAB_IDS[tabIndex];

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Click any memory</SlideKicker>
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

          {/* Selected node — ring/glow while the panel is open */}
          <At l={CENTER.l} t={CENTER.t}>
            <motion.div
              className="relative inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-background"
              initial={false}
              animate={{
                boxShadow: panelOpen
                  ? "0 0 0 5px color-mix(in oklch, var(--foreground) 20%, transparent)"
                  : "0 0 0 0px color-mix(in oklch, var(--foreground) 0%, transparent)",
              }}
              transition={{ duration: 0.4 }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-background" />
              <span className="text-base font-medium">Trip to Japan</span>

              {/* Click ripple — replays each cycle when the node is clicked */}
              {clickKey > 0 ? (
                <motion.span
                  key={clickKey}
                  className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background/60"
                  initial={{ scale: 0.4, opacity: 0.7 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              ) : null}

              {/* Cursor — only for the node click; gone during tab rotation */}
              <AnimatePresence>
                {cursorVisible ? (
                  <motion.span
                    key="cursor"
                    className="pointer-events-none absolute left-[80%] top-[72%]"
                    initial={{ opacity: 0, x: 26, y: 26 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Cursor />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </At>
        </div>

        {/* Right — the detail panel; opens/closes with each cycle */}
        <motion.div
          initial={false}
          animate={{ opacity: panelOpen ? 1 : 0, x: panelOpen ? 0 : 28 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className="flex h-full flex-col p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                Trip to Japan
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
                    A week in Japan in March — Tokyo, then Kyoto. The Shinjuku
                    hotel and a Kyoto ryokan are booked; still need to sort the
                    metro pass.
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
                  plan
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
