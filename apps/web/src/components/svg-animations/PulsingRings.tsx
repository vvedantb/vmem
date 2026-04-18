/**
 * Concentric pulsing rings animation for voice recording state.
 * Creates multiple expanding rings with staggered timing.
 */
"use client";

import { motion } from "motion/react";

interface PulsingRingsProps {
  /** Size of the container (should match button size) */
  size: number;
  /** Number of rings to display */
  ringCount?: number;
  /** Color of the rings */
  color?: string;
  /** Whether the animation is active */
  active?: boolean;
}

export function PulsingRings({
  size,
  ringCount = 3,
  color = "#f87171", // red-400
  active = true,
}: PulsingRingsProps) {
  if (!active) return null;

  const rings = Array.from({ length: ringCount }, (_, i) => i);
  const baseDelay = 1.2 / ringCount;

  return (
    <svg
      width={size * 1.6}
      height={size * 1.6}
      viewBox="0 0 100 100"
      className="absolute inset-0 pointer-events-none"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      {rings.map((i) => (
        <motion.circle
          key={i}
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ r: 30, opacity: 0.6 }}
          animate={{ r: 48, opacity: 0 }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeOut",
            delay: i * baseDelay,
          }}
        />
      ))}
    </svg>
  );
}
