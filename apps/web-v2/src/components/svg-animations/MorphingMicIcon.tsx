/**
 * Morphing microphone to stop icon using SVG path animations.
 * Smooth transition between mic and stop states.
 */
"use client";

import { motion } from "motion/react";

interface MorphingMicIconProps {
  isListening: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function MorphingMicIcon({
  isListening,
  size = 32,
  strokeWidth = 2,
  className,
}: MorphingMicIconProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      initial={false}
    >
      {isListening ? (
        // Stop icon (rounded square)
        <motion.rect
          x="6"
          y="6"
          width="12"
          height="12"
          rx="2"
          initial={{ scale: 0.8, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      ) : (
        // Microphone icon
        <motion.g
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* Mic body */}
          <motion.rect
            x="9"
            y="1"
            width="6"
            height="12"
            rx="3"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            style={{ transformOrigin: "center bottom" }}
          />
          {/* Mic arc */}
          <motion.path
            d="M19 10v2a7 7 0 0 1-14 0v-2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          />
          {/* Mic stand */}
          <motion.path
            d="M12 19v4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.15, delay: 0.2 }}
          />
          {/* Mic base */}
          <motion.path
            d="M8 23h8"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.15, delay: 0.25 }}
          />
        </motion.g>
      )}
    </motion.svg>
  );
}
