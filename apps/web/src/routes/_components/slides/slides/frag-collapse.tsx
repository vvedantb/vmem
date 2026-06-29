import { useContext } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStepContext,
} from "../_components/SlideShell";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { ToolLogo } from "../_components/ToolLogos";
import type { ToolKey } from "../_components/ToolLogos";
import { VmemDrawInIcon } from "@/components/svg-animations";

/**
 * The payoff half of the fragmentation beat (paired with frag-scatter).
 *  step 0 — the same scattered tool nodes, still disconnected
 *  step 1 — a single vmem node pops in at the centre and solid edges draw out
 *           to every tool: one layer underneath them all
 *  step 2 — the resolution line
 * Mirrors slide 36's edge/node approach (SVG lines in 0-100 space, solid
 * strokes — never dashed). All mock data.
 */

const CENTER = { l: 50, t: 50 };

interface Tool {
  l: number;
  t: number;
  label: string;
  tool: ToolKey;
}

const TOOLS: Tool[] = [
  { l: 18, t: 22, label: "ChatGPT", tool: "chatgpt" },
  { l: 82, t: 22, label: "Claude", tool: "claude" },
  { l: 10, t: 52, label: "Gemini", tool: "gemini" },
  { l: 90, t: 52, label: "Copilot", tool: "copilot" },
  { l: 24, t: 82, label: "Browser", tool: "browser" },
  { l: 76, t: 82, label: "Grok", tool: "grok" },
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

interface Point {
  l: number;
  t: number;
}

/**
 * A dot that travels along an edge between two percentage points, looping
 * forever. Two per edge (opposite directions) give the bidirectional "feeding"
 * flow: tools feed memory into vmem, vmem feeds it back. Positioned in the same
 * 0-100 space as the nodes, so it tracks the SVG edges exactly.
 */
function FeedDot({
  from,
  to,
  delay,
  className,
}: {
  from: Point;
  to: Point;
  delay: number;
  className: string;
}) {
  return (
    <motion.span
      aria-hidden
      className={`pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${className}`}
      initial={{ left: `${from.l}%`, top: `${from.t}%`, opacity: 0 }}
      animate={{
        left: [`${from.l}%`, `${to.l}%`],
        top: [`${from.t}%`, `${to.t}%`],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 1.8,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 0.15,
        delay,
      }}
    />
  );
}

export function SlideFragmentCollapse() {
  const step = useContext(SlideStepContext);
  const connected = step >= 1;

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>One layer underneath them all</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["It all collapses into one."]} size="xl" />

      <div className="relative mt-4 min-h-0 flex-1">
        {/* Edge layer — lines from vmem out to every tool, drawn on step 1. */}
        <svg
          className="absolute inset-0 h-full w-full text-foreground/35"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          {TOOLS.map((tool) => (
            <motion.line
              key={tool.label}
              x1={CENTER.l}
              y1={CENTER.t}
              stroke="currentColor"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{
                x2: connected ? tool.l : CENTER.l,
                y2: connected ? tool.t : CENTER.t,
                opacity: connected ? 1 : 0,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ))}
        </svg>

        {/* Tool nodes — present from the start (the scatter carried over). */}
        {TOOLS.map((tool) => (
          <At key={tool.label} l={tool.l} t={tool.t}>
            <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface-secondary px-4 py-2 text-foreground">
              <ToolLogo tool={tool.tool} className="h-4 w-4 shrink-0" />
              <span className="text-sm">{tool.label}</span>
            </div>
          </At>
        ))}

        {/* Feeding dots — bidirectional flow along every edge once connected.
            Rendered before the vmem node so the node covers the convergence
            point: dots look absorbed into vmem and emitted back out. */}
        {connected &&
          TOOLS.flatMap((tool, i) => [
            <FeedDot
              key={`in-${tool.label}`}
              from={{ l: tool.l, t: tool.t }}
              to={CENTER}
              delay={0.4 + i * 0.14}
              className="bg-foreground"
            />,
            <FeedDot
              key={`out-${tool.label}`}
              from={CENTER}
              to={{ l: tool.l, t: tool.t }}
              delay={0.4 + i * 0.14 + 0.9}
              className="bg-foreground/45"
            />,
          ])}

        {/* vmem node — pops in at the centre on step 1. */}
        <At l={CENTER.l} t={CENTER.t}>
          <motion.div
            initial={false}
            animate={{ opacity: connected ? 1 : 0, scale: connected ? 1 : 0.5 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-5 py-2.5 text-background"
          >
            <VmemDrawInIcon size={20} className="shrink-0 text-background" />
            <span className="font-instrumentSerif text-xl leading-none text-background">
              v<span className="italic">mem</span>
            </span>
          </motion.div>
        </At>
      </div>

      <SlideReveal step={2} className="mt-4">
        <SlideBody>
          vmem holds the memory once. Every tool reads from the same place — and
          it's <span className="text-foreground">yours</span>, not theirs.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
