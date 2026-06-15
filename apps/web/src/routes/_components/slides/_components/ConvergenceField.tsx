import { motion } from "motion/react";

/**
 * Ambient backdrop for the company-brain slide: scattered data fragments fly
 * inward along trails to a bright central node and merge, on staggered loops —
 * "all your data converging into one place". Rendered as SVG (cheap repaint,
 * no layout thrash) in a 1280×720 viewBox matching the design stage. Positions
 * are deterministic so layout is stable.
 */

const CENTER = { x: 640, y: 360 };

// Perimeter start points spread around the centre.
const FRAGMENTS = [
  { x: 120, y: 110 },
  { x: 1160, y: 90 },
  { x: 180, y: 620 },
  { x: 1120, y: 640 },
  { x: 640, y: 60 },
  { x: 70, y: 360 },
  { x: 1210, y: 380 },
  { x: 400, y: 660 },
  { x: 900, y: 650 },
  { x: 300, y: 200 },
  { x: 1000, y: 220 },
  { x: 760, y: 680 },
] as const;

const DURATION = 3.4;
const STAGGER = 0.28;

export function ConvergenceField() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-foreground"
      viewBox="0 0 1280 720"
      fill="none"
      aria-hidden
    >
      {/* Trails + travelling fragments */}
      {FRAGMENTS.map((f, i) => {
        const delay = (i % FRAGMENTS.length) * STAGGER;
        return (
          <g key={i}>
            {/* Faint trail the fragment rides in along */}
            <motion.line
              x1={f.x}
              y1={f.y}
              x2={CENTER.x}
              y2={CENTER.y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-foreground/15"
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{
                duration: DURATION,
                repeat: Infinity,
                delay,
                repeatDelay: 0.5,
                ease: "easeInOut",
              }}
            />
            {/* The fragment itself, flying from perimeter to centre */}
            <motion.circle
              r={5}
              fill="currentColor"
              className="text-foreground/80"
              initial={{ cx: f.x, cy: f.y, opacity: 0 }}
              animate={{
                cx: [f.x, CENTER.x],
                cy: [f.y, CENTER.y],
                opacity: [0, 1, 1, 0],
                scale: [1, 1, 0.4],
              }}
              transition={{
                duration: DURATION,
                times: [0, 0.15, 0.85, 1],
                repeat: Infinity,
                delay,
                repeatDelay: 0.5,
                ease: [0.5, 0, 0.5, 1],
              }}
            />
          </g>
        );
      })}

      {/* Central node — the brain everything merges into */}
      <motion.circle
        cx={CENTER.x}
        cy={CENTER.y}
        fill="currentColor"
        className="text-foreground"
        animate={{ r: [8, 12, 8], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx={CENTER.x}
        cy={CENTER.y}
        fill="currentColor"
        className="text-foreground/30"
        animate={{ r: [12, 34], opacity: [0.4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
      />
    </svg>
  );
}
