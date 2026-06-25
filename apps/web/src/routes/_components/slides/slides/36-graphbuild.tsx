import { useContext } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStepContext,
} from "../_components/SlideShell";

/**
 * Animated mock memory graph, driven by the slide's auto-playing build steps:
 *  step 0   — one central memory node
 *  steps 1-4 — a satellite node appears each step, its edge grows out from the
 *              centre with a relationship label
 *  step 5   — the whole cluster zooms out and a field of further nodes fades in
 * Nodes are HTML chips (crisp, on-brand pills); edges are an SVG layer in the
 * same 0-100 percentage space. All mock data.
 */

const CENTER = { l: 50, t: 50 };

interface Satellite {
  l: number;
  t: number;
  label: string;
  /** Relationship shown on the connecting edge. */
  relation: string;
}

const SATELLITES: Satellite[] = [
  { l: 24, t: 23, label: "Kyoto ryokan booked", relation: "part of" },
  { l: 77, t: 25, label: "Loved the ramen in Shibuya", relation: "last time" },
  { l: 21, t: 78, label: "Get a Suica card", relation: "tip" },
  { l: 79, t: 75, label: "Prefers a window seat", relation: "noted" },
];

// Far-field nodes (no labels/edges) that fade in once the cluster zooms out.
const OUTER_NODES = [
  { l: 8, t: 12 },
  { l: 92, t: 9 },
  { l: 5, t: 55 },
  { l: 95, t: 60 },
  { l: 50, t: 5 },
  { l: 13, t: 92 },
  { l: 88, t: 93 },
  { l: 50, t: 95 },
  { l: 31, t: 7 },
  { l: 69, t: 94 },
] as const;

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

function NodeChip({
  label,
  center = false,
}: {
  label: string;
  center?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 ${
        center
          ? "bg-foreground text-background"
          : "bg-surface-secondary text-foreground"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          center ? "bg-background" : "bg-foreground/60"
        }`}
      />
      <span className={center ? "text-base font-medium" : "text-sm"}>
        {label}
      </span>
    </div>
  );
}

export function Slide36GraphBuild() {
  const step = useContext(SlideStepContext);
  const zoomed = step >= 5;

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Memory graph</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One memory becomes a web."]} size="xl" />

      <div className="relative mt-4 min-h-0 flex-1">
        {/* Cluster — scales down on the zoom-out step (about its centre). */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: "center" }}
          animate={{ scale: zoomed ? 0.62 : 1 }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Edge layer — percentage coordinate space, crisp strokes. */}
          <svg
            className="absolute inset-0 h-full w-full text-foreground/35"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            {SATELLITES.map((s, i) => {
              const visible = step >= i + 1;
              return (
                <motion.line
                  key={s.label}
                  x1={CENTER.l}
                  y1={CENTER.t}
                  stroke="currentColor"
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                  initial={false}
                  animate={{
                    x2: visible ? s.l : CENTER.l,
                    y2: visible ? s.t : CENTER.t,
                    opacity: visible ? 1 : 0,
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              );
            })}
          </svg>

          {/* Relationship labels at edge midpoints */}
          {SATELLITES.map((s, i) => {
            const visible = step >= i + 1;
            return (
              <At
                key={`rel-${s.label}`}
                l={(CENTER.l + s.l) / 2}
                t={(CENTER.t + s.t) / 2}
              >
                <motion.span
                  className="rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] text-muted"
                  initial={false}
                  animate={{
                    opacity: visible ? 1 : 0,
                    scale: visible ? 1 : 0.8,
                  }}
                  transition={{ duration: 0.4, delay: visible ? 0.35 : 0 }}
                >
                  {s.relation}
                </motion.span>
              </At>
            );
          })}

          {/* Satellite nodes */}
          {SATELLITES.map((s, i) => {
            const visible = step >= i + 1;
            return (
              <At key={`node-${s.label}`} l={s.l} t={s.t}>
                <motion.div
                  initial={false}
                  animate={{
                    opacity: visible ? 1 : 0,
                    scale: visible ? 1 : 0.5,
                  }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                >
                  <NodeChip label={s.label} />
                </motion.div>
              </At>
            );
          })}

          {/* Central node — always present */}
          <At l={CENTER.l} t={CENTER.t}>
            <NodeChip label="Trip to Japan" center />
          </At>
        </motion.div>

        {/* Far-field nodes — full size, fade in once zoomed out. */}
        {OUTER_NODES.map((n, i) => (
          <At key={`outer-${i}`} l={n.l} t={n.t}>
            <motion.span
              className="block h-2.5 w-2.5 rounded-full bg-foreground/35"
              initial={false}
              animate={{ opacity: zoomed ? 1 : 0, scale: zoomed ? 1 : 0.3 }}
              transition={{
                duration: 0.5,
                delay: zoomed ? 0.3 + i * 0.05 : 0,
                ease: "easeOut",
              }}
            />
          </At>
        ))}
      </div>
    </SlideShell>
  );
}
