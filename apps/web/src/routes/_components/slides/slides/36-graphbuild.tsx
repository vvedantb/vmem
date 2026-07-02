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
// Scale the whole cluster shrinks to on the zoom-out step (used for both the
// transform and for placing the bridge lines onto the zoomed example nodes).
const ZOOM = 0.62;

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

// ── Far-field web ──────────────────────────────────────────────────────────
// Once the cluster zooms out it should sit inside a dense, organic web of
// other memories — dots scattered everywhere (not just the edges), each with
// a couple of links so chains meander through the field, like a real memory
// graph. Generated deterministically from a seeded PRNG at module level so
// every render (and SSR) produces the identical layout.

/** Tiny deterministic PRNG (mulberry32) — same field on every render. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FieldNode {
  l: number;
  t: number;
  s: number;
  o: number;
}

/** The zoomed cluster (chips + labels) occupies the middle — keep it clear. */
function inClearing(l: number, t: number): boolean {
  return Math.abs(l - CENTER.l) < 27 && Math.abs(t - CENTER.t) < 23;
}

function generateFieldNodes(count: number, seed: number): FieldNode[] {
  const rand = mulberry32(seed);
  const nodes: FieldNode[] = [];
  while (nodes.length < count) {
    const l = 4 + rand() * 92;
    const t = 4 + rand() * 92;
    if (inClearing(l, t)) continue;
    // Keep a little breathing room between dots so chains stay readable.
    if (nodes.some((n) => (n.l - l) ** 2 + (n.t - t) ** 2 < 20)) continue;
    nodes.push({
      l,
      t,
      s: 5 + Math.round(rand() * 6),
      o: 0.18 + rand() * 0.32,
    });
  }
  return nodes;
}

const OUTER_NODES = generateFieldNodes(46, 7);

/**
 * Web edges: every node links to its 2 nearest neighbours (deduped), so each
 * dot has multiple connections and the field reads as meandering chains
 * rather than isolated pairs.
 */
function kNearestEdges(
  nodes: ReadonlyArray<{ l: number; t: number }>,
  k: number,
): [number, number][] {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  nodes.forEach((a, i) => {
    const byDist = nodes
      .map((b, j) => ({ j, d: (a.l - b.l) ** 2 + (a.t - b.t) ** 2 }))
      .filter(({ j }) => j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, k);
    byDist.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push([i, j]);
    });
  });
  return edges;
}

const OUTER_EDGES = kNearestEdges(OUTER_NODES, 2);

/** A point's position after the cluster zooms to ZOOM about the centre. */
function zoomedPoint(l: number, t: number) {
  return {
    l: CENTER.l + ZOOM * (l - CENTER.l),
    t: CENTER.t + ZOOM * (t - CENTER.t),
  };
}

/**
 * Bridges tying the field into the cluster: each example node (at its
 * zoomed-out position) links to its two nearest field dots, so the cluster is
 * woven into the surrounding web rather than floating inside it.
 */
const BRIDGES: { outer: number; sat: number }[] = SATELLITES.flatMap(
  (s, sat) => {
    const p = zoomedPoint(s.l, s.t);
    return OUTER_NODES.map((n, outer) => ({
      outer,
      sat,
      d: (n.l - p.l) ** 2 + (n.t - p.t) ** 2,
    }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map(({ outer }) => ({ outer, sat }));
  },
);

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
        <SlideKicker>How it connects</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One memory becomes a web."]} size="xl" />

      <div className="relative mt-4 min-h-0 flex-1">
        {/* Cluster — scales down on the zoom-out step (about its centre). */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: "center" }}
          animate={{ scale: zoomed ? ZOOM : 1 }}
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

        {/* Far-field edges — faint nearest-neighbour links between the outer
            dots, so they read as a connected graph. Fainter than the dots and
            in the same unscaled 0-100 space (outside the zoomed cluster). */}
        <svg
          className="absolute inset-0 h-full w-full text-foreground"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          {OUTER_EDGES.map(([a, b], i) => {
            const na = OUTER_NODES[a];
            const nb = OUTER_NODES[b];
            return (
              <motion.line
                key={`outer-edge-${a}-${b}`}
                x1={na.l}
                y1={na.t}
                x2={nb.l}
                y2={nb.t}
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ opacity: zoomed ? 0.14 : 0 }}
                transition={{
                  duration: 0.5,
                  delay: zoomed ? 0.45 + i * 0.02 : 0,
                  ease: "easeOut",
                }}
              />
            );
          })}

          {/* Bridges from the outer field into the inner example nodes */}
          {BRIDGES.map(({ outer, sat }, i) => {
            const na = OUTER_NODES[outer];
            const p = zoomedPoint(SATELLITES[sat].l, SATELLITES[sat].t);
            return (
              <motion.line
                key={`bridge-${outer}-${sat}`}
                x1={na.l}
                y1={na.t}
                x2={p.l}
                y2={p.t}
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ opacity: zoomed ? 0.16 : 0 }}
                transition={{
                  duration: 0.5,
                  delay: zoomed ? 0.55 + i * 0.02 : 0,
                  ease: "easeOut",
                }}
              />
            );
          })}
        </svg>

        {/* Far-field nodes — depth-varied dots that fade in once zoomed out,
            surrounding the cluster so it reads as one node in a bigger graph.
            Opacity is driven inline (foreground-token alpha is unreliable). */}
        {OUTER_NODES.map((n, i) => (
          <At key={`outer-${i}`} l={n.l} t={n.t}>
            <motion.span
              className="block rounded-full bg-foreground"
              style={{ width: n.s, height: n.s }}
              initial={false}
              animate={{ opacity: zoomed ? n.o : 0, scale: zoomed ? 1 : 0.3 }}
              transition={{
                duration: 0.5,
                delay: zoomed ? 0.3 + i * 0.03 : 0,
                ease: "easeOut",
              }}
            />
          </At>
        ))}
      </div>
    </SlideShell>
  );
}
