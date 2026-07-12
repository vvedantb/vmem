/**
 * Animated status dot with glow and ripple effects for voice status indication.
 * Uses SVG for smooth animations and glow effects.
 */
"use client";

import { motion } from "motion/react";
import type { VoicePhase } from "@/components/contexts/VoiceContext";

interface AnimatedStatusDotProps {
  phase: VoicePhase;
  size?: number;
}

const PHASE_COLORS: Record<VoicePhase, { fill: string; glow: string }> = {
  idle: { fill: "var(--muted)", glow: "var(--muted)" },
  listening: { fill: "var(--danger)", glow: "var(--danger)" },
  thinking: { fill: "var(--warning)", glow: "var(--warning)" },
  speaking: { fill: "var(--success)", glow: "var(--success)" },
  error: { fill: "var(--danger)", glow: "var(--danger)" },
};

export function AnimatedStatusDot({
  phase,
  size = 10,
}: AnimatedStatusDotProps) {
  const colors = PHASE_COLORS[phase];
  const isActive = phase === "listening" || phase === "speaking";
  const isListening = phase === "listening";

  return (
    <svg
      width={size * 3}
      height={size * 3}
      viewBox="0 0 30 30"
      className="overflow-visible"
    >
      <defs>
        {/* Glow filter for active states */}
        <filter
          id={`glow-${phase}`}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ripple rings for listening state */}
      {isListening && (
        <>
          <motion.circle
            cx="15"
            cy="15"
            r="5"
            fill="none"
            stroke={colors.glow}
            strokeWidth="1"
            initial={{ r: 5, opacity: 0.6 }}
            animate={{ r: 14, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
          <motion.circle
            cx="15"
            cy="15"
            r="5"
            fill="none"
            stroke={colors.glow}
            strokeWidth="1"
            initial={{ r: 5, opacity: 0.6 }}
            animate={{ r: 14, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.5,
            }}
          />
          <motion.circle
            cx="15"
            cy="15"
            r="5"
            fill="none"
            stroke={colors.glow}
            strokeWidth="1"
            initial={{ r: 5, opacity: 0.6 }}
            animate={{ r: 14, opacity: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
              delay: 1,
            }}
          />
        </>
      )}

      {/* Outer glow ring for active states */}
      {isActive && (
        <motion.circle
          cx="15"
          cy="15"
          r="7"
          fill={colors.glow}
          opacity={0.3}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.15, 0.3] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Main dot with glow */}
      <motion.circle
        cx="15"
        cy="15"
        r="5"
        fill={colors.fill}
        filter={isActive ? `url(#glow-${phase})` : undefined}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    </svg>
  );
}
