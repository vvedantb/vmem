import type { ReactNode } from "react";
import { motion } from "motion/react";
import { IconFolder, IconFileText, IconBolt } from "@tabler/icons-react";
import ClaudeLogo from "@/components/settings/ClaudeLogo";
import { EvaIcon } from "@/components/brand-icons";
import { ToolLogo } from "./ToolLogos";

/** Cursor logo mark (from svgl) — coloured via `currentColor`. */
function CursorMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 466.73 532.09"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
    </svg>
  );
}

/**
 * Mini mockups shown inside the larger bento tiles (slide 13). The list-style
 * ones spin like slot wheels (see `Reel`); MCP (live clients) and the Connectors
 * logo list stay static. All static data, theme-token based (dark tiles).
 */

/**
 * Vertical slot-wheel. Renders its items twice and scrolls up forever; the loop
 * is seamless because the second copy is identical to the first at -50%. Spacing
 * is baked into each item (mb) rather than flex `gap`, so -50% lands exactly one
 * full set with no half-gap hitch.
 */
function Reel({ items, duration }: { items: ReactNode[]; duration: number }) {
  const loop = [...items, ...items];
  return (
    <motion.div
      className="w-full"
      animate={{ y: ["0%", "-50%"] }}
      transition={{ duration, ease: "linear", repeat: Infinity }}
    >
      {loop.map((item, i) => (
        <div key={i} className="mb-2.5">
          {item}
        </div>
      ))}
    </motion.div>
  );
}

/** Shared rounded "row" pill used by most reels. */
function PillRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-tertiary/70 px-3.5 py-2.5">
      {children}
    </div>
  );
}

/** Two browsing-history wheels for the wide Browser extension tile. */
export function HistoryMockup() {
  const colA = [
    { site: "github.com/vmem", time: "2m" },
    { site: "notion.so/roadmap", time: "1h" },
    { site: "vercel.com", time: "5h" },
  ];
  const colB = [
    { site: "youtube.com", time: "14m" },
    { site: "react.dev/docs", time: "3h" },
    { site: "news.ycombinator", time: "1d" },
  ];
  const row = (r: { site: string; time: string }) => (
    <PillRow key={r.site}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground/40" />
      <span className="flex-1 truncate text-sm text-muted">{r.site}</span>
      <span className="shrink-0 text-xs text-muted">{r.time}</span>
    </PillRow>
  );
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Reel duration={12} items={colA.map(row)} />
      <Reel duration={15} items={colB.map(row)} />
    </div>
  );
}

/** Scrolling doc list for the Wiki tile. */
export function WikiMockup() {
  const docs = [
    "Onboarding guide",
    "API reference",
    "Deploy runbook",
    "Architecture notes",
    "Style guide",
  ];
  return (
    <Reel
      duration={15}
      items={docs.map((d) => (
        <PillRow key={d}>
          <IconFileText
            size={14}
            stroke={1.5}
            className="shrink-0 text-muted"
          />
          <span className="truncate text-sm text-muted">{d}</span>
        </PillRow>
      ))}
    />
  );
}

/**
 * Connected-clients panel for the inverted MCP Connector hero (static). The hero
 * tile is white, so this is intentionally dark-on-white rather than token-based.
 */
export function McpMockup() {
  const clients: { label: string; icon: ReactNode }[] = [
    {
      label: "Claude",
      icon: <ClaudeLogo className="h-4 w-4 text-[#D97757]" />,
    },
    {
      label: "Cursor",
      icon: <CursorMark className="h-4 w-4 text-neutral-700" />,
    },
    {
      label: "ChatGPT",
      icon: <ToolLogo tool="chatgpt" className="h-4 w-4 text-neutral-800" />,
    },
    { label: "Your agents", icon: <EvaIcon size={16} /> },
  ];
  return (
    <div className="space-y-2">
      {clients.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-2.5 rounded-xl bg-neutral-900/[0.06] px-3 py-2.5"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {c.icon}
          </span>
          <span className="flex-1 text-sm text-neutral-500">{c.label}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            live
          </span>
        </div>
      ))}
    </div>
  );
}

/** Scrolling file-tree wheel for the Codebases tile. */
export function FileTreeMockup() {
  const rows = [
    { name: "apps", depth: 0, folder: true },
    { name: "web", depth: 1, folder: true },
    { name: "index.ts", depth: 2, folder: false },
    { name: "packages", depth: 0, folder: true },
    { name: "backend", depth: 1, folder: true },
    { name: "schema.ts", depth: 2, folder: false },
  ];
  return (
    <Reel
      duration={16}
      items={rows.map((r) => (
        <div
          key={`${r.depth}-${r.name}`}
          className="flex items-center gap-2 text-sm text-muted"
          style={{ paddingLeft: r.depth * 16 }}
        >
          {r.folder ? (
            <IconFolder
              size={15}
              stroke={1.5}
              className="shrink-0 text-muted"
            />
          ) : (
            <IconFileText
              size={15}
              stroke={1.5}
              className="shrink-0 text-muted"
            />
          )}
          <span className="truncate">{r.name}</span>
        </div>
      ))}
    />
  );
}

/** Scrolling memory wheel for the Web tile. */
export function WebMockup() {
  const memories = [
    "Prefers TypeScript over JS",
    "Q4 roadmap priorities",
    "Vendor research notes",
    "Standup is at 10am",
    "No deploys on Fridays",
  ];
  return (
    <Reel
      duration={15}
      items={memories.map((m) => (
        <PillRow key={m}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-foreground/40" />
          <span className="truncate text-sm text-muted">{m}</span>
        </PillRow>
      ))}
    />
  );
}

/** Scrolling slash-command wheel for the Skills tile. */
export function SkillsMockup() {
  const skills = [
    "/changelog",
    "/triage-issue",
    "/summarise",
    "/code-review",
    "/ship",
  ];
  return (
    <Reel
      duration={14}
      items={skills.map((s) => (
        <PillRow key={s}>
          <IconBolt size={14} stroke={1.5} className="shrink-0 text-muted" />
          <span className="font-mono text-sm text-muted">{s}</span>
        </PillRow>
      ))}
    />
  );
}
