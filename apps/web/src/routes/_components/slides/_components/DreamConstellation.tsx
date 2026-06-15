import { motion } from "motion/react";

/**
 * Ambient backdrop for the Dream Mode slide: a faint constellation where new
 * edges draw themselves between nodes on staggered loops, and nodes softly
 * twinkle — evoking vmem forming fresh connections while you are away. Sits
 * behind the slide content at low opacity so the cards stay readable.
 * Coordinates are in a 1280×720 viewBox matching the design stage; positions
 * are deterministic so layout is stable.
 */

const NODES = [
  { x: 180, y: 140 },
  { x: 420, y: 90 },
  { x: 760, y: 130 },
  { x: 1080, y: 110 },
  { x: 300, y: 360 },
  { x: 980, y: 340 },
  { x: 1140, y: 520 },
  { x: 620, y: 300 },
  { x: 860, y: 560 },
] as const;

// Edges drawn between node indices; each draws in then fades, on its own loop.
const EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 4],
  [2, 5],
  [3, 5],
  [5, 6],
  [1, 7],
  [7, 5],
  [4, 8],
  [8, 6],
] as const;

export function DreamConstellation() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-90 [-webkit-mask-image:linear-gradient(120deg,transparent_4%,black_46%)] [mask-image:linear-gradient(120deg,transparent_4%,black_46%)]"
      viewBox="0 0 1280 720"
      fill="none"
      aria-hidden
    >
      {EDGES.map(([a, b], i) => {
        const from = NODES[a];
        const to = NODES[b];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        return (
          <motion.line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-foreground/40"
            strokeDasharray={length}
            initial={{ strokeDashoffset: length, opacity: 0 }}
            animate={{
              strokeDashoffset: [length, 0, 0, length],
              opacity: [0, 0.9, 0.9, 0],
            }}
            transition={{
              duration: 6,
              times: [0, 0.35, 0.7, 1],
              repeat: Infinity,
              delay: (i % EDGES.length) * 0.55,
              ease: "easeInOut",
            }}
          />
        );
      })}

      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x}
          cy={n.y}
          r={4}
          className="fill-foreground/80"
          animate={{ opacity: [0.4, 1, 0.4], r: [3.5, 5, 3.5] }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            delay: (i % NODES.length) * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}
