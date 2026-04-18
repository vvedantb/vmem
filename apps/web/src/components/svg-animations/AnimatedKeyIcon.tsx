/**
 * Animated key/bolt icon with sparkle effects for empty API keys state.
 * Key rotates slightly and sparkles twinkle around it.
 */
"use client";

import { motion } from "motion/react";

interface AnimatedKeyIconProps {
  size?: number;
  className?: string;
}

function Sparkle({
  x,
  y,
  delay,
  size = 3,
}: {
  x: number;
  y: number;
  delay: number;
  size?: number;
}) {
  return (
    <motion.g transform={`translate(${x}, ${y})`}>
      {/* Four-pointed star sparkle */}
      <motion.path
        d={`M0 -${size} L0 ${size} M-${size} 0 L${size} 0`}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{
          scale: [0, 1, 0],
          opacity: [0, 1, 0],
          rotate: [0, 45, 90],
        }}
        transition={{
          duration: 1.2,
          delay,
          repeat: Infinity,
          repeatDelay: 2,
          ease: "easeInOut",
        }}
      />
    </motion.g>
  );
}

export function AnimatedKeyIcon({
  size = 48,
  className,
}: AnimatedKeyIconProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Sparkles around the key */}
      <Sparkle x={8} y={10} delay={0} size={2.5} />
      <Sparkle x={40} y={12} delay={0.4} size={2} />
      <Sparkle x={36} y={38} delay={0.8} size={2.5} />
      <Sparkle x={10} y={36} delay={1.2} size={2} />

      {/* Bolt/Key icon with gentle pulse */}
      <motion.g
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.02, 1] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Lightning bolt shape */}
        <motion.path
          d="M26 6L14 26h8l-4 16 16-22h-9l5-14z"
          strokeWidth="1.5"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </motion.g>

      {/* Subtle glow pulse behind */}
      <motion.circle
        cx="24"
        cy="24"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity={0.2}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: [0.9, 1.1, 0.9], opacity: [0, 0.15, 0] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.svg>
  );
}
