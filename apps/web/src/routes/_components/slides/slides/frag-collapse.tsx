import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  SlideShell,
  SlideKicker,
  SlideReveal,
} from "../_components/SlideShell";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { ToolLogo } from "../_components/ToolLogos";
import {
  GoogleDriveIcon,
  NotionIcon,
  GitHubIcon,
} from "@/components/brand-icons";
import { VmemDrawInIcon } from "@/components/svg-animations";

/**
 * vmem as the layer in the middle, on a self-running loop:
 *  ingest phase — connectors (Drive, Notion, GitHub, your chats) sit around vmem
 *                 and dots flow INWARD: everything feeds vmem.
 *  serve phase  — the outer nodes morph into the AI models and the dots reverse,
 *                 flowing OUTWARD: vmem serves its memory to any model.
 * Edges are SVG lines in 0-100 space; nodes + dots share that space. Mock data.
 */

const CENTER = { l: 50, t: 50 };

interface Point {
  l: number;
  t: number;
}

// Five evenly-spread anchor points around the hub (a pentagon).
const POS: Point[] = [
  { l: 50, t: 14 },
  { l: 87, t: 40 },
  { l: 73, t: 86 },
  { l: 27, t: 86 },
  { l: 13, t: 40 },
];

interface NodeContent {
  label: string;
  icon: ReactNode;
}

// Phase 1 — what feeds vmem.
const CONNECTORS: NodeContent[] = [
  {
    label: "Claude",
    icon: <ToolLogo tool="claude" className="h-4 w-4 shrink-0" />,
  },
  {
    label: "ChatGPT",
    icon: (
      <ToolLogo tool="chatgpt" className="h-4 w-4 shrink-0 text-foreground" />
    ),
  },
  { label: "Google Drive", icon: <GoogleDriveIcon size={16} /> },
  { label: "Notion", icon: <NotionIcon size={16} /> },
  {
    label: "GitHub",
    icon: <GitHubIcon size={16} className="text-foreground" />,
  },
];

// Phase 2 — the models vmem serves.
const PROVIDERS: NodeContent[] = [
  {
    label: "ChatGPT",
    icon: (
      <ToolLogo tool="chatgpt" className="h-4 w-4 shrink-0 text-foreground" />
    ),
  },
  {
    label: "Claude",
    icon: <ToolLogo tool="claude" className="h-4 w-4 shrink-0" />,
  },
  {
    label: "Gemini",
    icon: <ToolLogo tool="gemini" className="h-4 w-4 shrink-0" />,
  },
  {
    label: "Copilot",
    icon: <ToolLogo tool="copilot" className="h-4 w-4 shrink-0" />,
  },
  {
    label: "Grok",
    icon: <ToolLogo tool="grok" className="h-4 w-4 shrink-0 text-foreground" />,
  },
];

/** Absolutely positioned at a percentage point, centred on it. */
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

/** A dot that travels an edge from → to, looping forever (direction = data flow). */
function FeedDot({
  from,
  to,
  delay,
}: {
  from: Point;
  to: Point;
  delay: number;
}) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
      initial={{ left: `${from.l}%`, top: `${from.t}%`, opacity: 0 }}
      animate={{
        left: [`${from.l}%`, `${to.l}%`],
        top: [`${from.t}%`, `${to.t}%`],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 1.6,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 0.1,
        delay,
      }}
    />
  );
}

function NodePill({ label, icon }: NodeContent) {
  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-secondary px-4 py-2 text-foreground">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SlideFragmentCollapse() {
  const [phase, setPhase] = useState<"ingest" | "serve">("ingest");

  // Toggle the flow every few seconds: feed in, then serve out, forever.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p === "ingest" ? "serve" : "ingest"));
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const nodes = phase === "ingest" ? CONNECTORS : PROVIDERS;
  const ingest = phase === "ingest";

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The memory layer</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Everything in. Any model out."]} size="xl" />

      <div className="relative mt-4 min-h-0 flex-1">
        {/* Edges — vmem to every node, always present. */}
        <svg
          className="absolute inset-0 h-full w-full text-foreground/30"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          {POS.map((p, i) => (
            <line
              key={i}
              x1={CENTER.l}
              y1={CENTER.t}
              x2={p.l}
              y2={p.t}
              stroke="currentColor"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Flow dots — inward on ingest, outward on serve. Remount on phase flip. */}
        {POS.map((p, i) => (
          <FeedDot
            key={`${phase}-${i}`}
            from={ingest ? p : CENTER}
            to={ingest ? CENTER : p}
            delay={i * 0.18}
          />
        ))}

        {/* Outer nodes — crossfade between connectors and models on phase flip. */}
        {POS.map((p, i) => (
          <At key={i} l={p.l} t={p.t}>
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              >
                <NodePill {...nodes[i]} />
              </motion.div>
            </AnimatePresence>
          </At>
        ))}

        {/* vmem hub — always centred, painted last so dots converge behind it. */}
        <At l={CENTER.l} t={CENTER.t}>
          <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-5 py-2.5 text-background">
            <VmemDrawInIcon size={20} className="shrink-0 text-background" />
            <span className="font-instrumentSerif text-xl leading-none text-background">
              v<span className="italic">mem</span>
            </span>
          </div>
        </At>
      </div>

      <div className="mt-4 h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            className="text-lg leading-relaxed text-muted"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            {ingest ? (
              <>
                Drive, Notion, GitHub, your chats — it all{" "}
                <span className="text-foreground">feeds vmem</span>.
              </>
            ) : (
              <>
                vmem <span className="text-foreground">serves it back</span> to
                any model you use.
              </>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
    </SlideShell>
  );
}
