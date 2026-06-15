import { motion } from "motion/react";

/**
 * Ambient background for the company-brain slide: scattered fragments drift
 * inward to a central node and dissolve, on staggered loops — "all your data
 * converging into one place". Sits behind the slide content at low opacity so
 * it never competes with the text. Positions are deterministic (no random) so
 * the layout is stable across renders.
 */

// Perimeter start points (percent of the field), spread around the centre.
const FRAGMENTS = [
  { x: 6, y: 18 },
  { x: 92, y: 12 },
  { x: 14, y: 78 },
  { x: 88, y: 82 },
  { x: 50, y: 6 },
  { x: 4, y: 48 },
  { x: 96, y: 52 },
  { x: 30, y: 92 },
  { x: 70, y: 90 },
  { x: 20, y: 30 },
  { x: 80, y: 34 },
  { x: 60, y: 96 },
] as const;

const CENTER = { x: 50, y: 50 };

export function ConvergenceField() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {/* Central node — the brain everything converges into */}
      <motion.div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40"
        style={{
          left: `${CENTER.x}%`,
          top: `${CENTER.y}%`,
          boxShadow:
            "0 0 24px 6px color-mix(in oklch, var(--foreground) 22%, transparent)",
        }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {FRAGMENTS.map((f, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-foreground/50"
          style={{ left: `${f.x}%`, top: `${f.y}%` }}
          initial={false}
          animate={{
            left: [`${f.x}%`, `${CENTER.x}%`],
            top: [`${f.y}%`, `${CENTER.y}%`],
            opacity: [0, 0.6, 0],
            scale: [1, 0.4],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: [0.4, 0, 0.5, 1],
            delay: (i % FRAGMENTS.length) * 0.42,
            repeatDelay: 0.6,
          }}
        />
      ))}
    </div>
  );
}
