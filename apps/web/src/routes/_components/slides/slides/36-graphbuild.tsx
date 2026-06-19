import { useContext } from "react";
import { motion } from "motion/react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStepContext,
} from "../_components/SlideShell";

/**
 * Animated mock memory graph (slide build steps drive it):
 *  step 0 — one central memory node
 *  steps 1-4 — a new node appears each step, drawn in with a relationship label
 *  step 5 — the cluster zooms out and a scatter of further nodes fades in
 * All mock data; nothing live.
 */

const CENTER = { x: 500, y: 250 };

interface Satellite {
  x: number;
  y: number;
  label: string;
  /** Relationship shown on the connecting edge. */
  relation: string;
}

// Revealed one per step (1-4), each with its edge + relationship label.
const SATELLITES: Satellite[] = [
  { x: 235, y: 120, label: "Clerk MV3 setup", relation: "part of" },
  { x: 775, y: 130, label: "SW offline bug", relation: "caused" },
  { x: 215, y: 395, label: "Prefers Clerk over Auth0", relation: "because" },
  { x: 785, y: 385, label: "Extension token refresh", relation: "depends on" },
];

// Far-field nodes that fade in (no labels/edges) once the cluster zooms out.
const OUTER_NODES = [
  { x: 90, y: 70 },
  { x: 910, y: 60 },
  { x: 120, y: 470 },
  { x: 880, y: 480 },
  { x: 500, y: 30 },
  { x: 60, y: 250 },
  { x: 945, y: 270 },
  { x: 500, y: 500 },
  { x: 330, y: 30 },
  { x: 690, y: 500 },
] as const;

function NodeDot({
  x,
  y,
  r = 9,
  highlight = false,
}: {
  x: number;
  y: number;
  r?: number;
  highlight?: boolean;
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      className={highlight ? "fill-foreground" : "fill-foreground/70"}
    />
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

      <div className="mt-4 flex-1">
        <svg
          viewBox="0 0 1000 520"
          className="h-full w-full"
          fill="none"
          aria-hidden
        >
          {/* Core cluster — scales down on the zoom-out step. fill-box origin
              centres the scale on the (symmetric) cluster's own bounds. */}
          <motion.g
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            animate={{ scale: zoomed ? 0.6 : 1 }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Edges + relationship labels, revealed per step */}
            {SATELLITES.map((s, i) => {
              const visible = step >= i + 1;
              const midX = (CENTER.x + s.x) / 2;
              const midY = (CENTER.y + s.y) / 2;
              return (
                <motion.g
                  key={s.label}
                  initial={false}
                  animate={{ opacity: visible ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <motion.line
                    x1={CENTER.x}
                    y1={CENTER.y}
                    x2={s.x}
                    y2={s.y}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="text-foreground/30"
                    initial={false}
                    animate={{ pathLength: visible ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  />
                  {/* Relationship label on a faint backing pill */}
                  <rect
                    x={midX - s.relation.length * 4.4 - 8}
                    y={midY - 13}
                    width={s.relation.length * 8.8 + 16}
                    height={26}
                    rx={13}
                    className="fill-background"
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    className="fill-foreground/70"
                    style={{
                      fontSize: 14,
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {s.relation}
                  </text>
                </motion.g>
              );
            })}

            {/* Satellite nodes + labels */}
            {SATELLITES.map((s, i) => {
              const visible = step >= i + 1;
              return (
                <motion.g
                  key={`node-${s.label}`}
                  initial={false}
                  animate={{
                    opacity: visible ? 1 : 0,
                    scale: visible ? 1 : 0.3,
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                >
                  <NodeDot x={s.x} y={s.y} />
                  <text
                    x={s.x}
                    y={s.y + 30}
                    textAnchor="middle"
                    className="fill-foreground"
                    style={{
                      fontSize: 17,
                      fontFamily: "Instrument Sans, sans-serif",
                    }}
                  >
                    {s.label}
                  </text>
                </motion.g>
              );
            })}

            {/* Central node — always present */}
            <NodeDot x={CENTER.x} y={CENTER.y} r={13} highlight />
            <text
              x={CENTER.x}
              y={CENTER.y - 26}
              textAnchor="middle"
              className="fill-foreground"
              style={{
                fontSize: 20,
                fontFamily: "Instrument Sans, sans-serif",
              }}
            >
              Migrate auth to Clerk
            </text>
          </motion.g>

          {/* Far-field nodes — fade in once zoomed out, no labels or edges */}
          {OUTER_NODES.map((n, i) => (
            <motion.circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={5}
              className="fill-foreground/40"
              initial={false}
              animate={{ opacity: zoomed ? 1 : 0, scale: zoomed ? 1 : 0.2 }}
              transition={{
                duration: 0.6,
                delay: zoomed ? 0.3 + i * 0.05 : 0,
                ease: "easeOut",
              }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          ))}
        </svg>
      </div>
    </SlideShell>
  );
}
