/**
 * Cross-fades between microphone and stop icons (scale + opacity + blur).
 */
"use client";

import { motion } from "motion/react";
import { cn } from "@vmem/ui";

interface MorphingMicIconProps {
  isListening: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const iconTransition = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} as const;

const hiddenState = {
  scale: 0.25,
  opacity: 0,
  filter: "blur(4px)",
};

const visibleState = {
  scale: 1,
  opacity: 1,
  filter: "blur(0px)",
};

export function MorphingMicIcon({
  isListening,
  size = 32,
  strokeWidth = 2,
  className,
}: MorphingMicIconProps) {
  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "absolute inset-0",
  };

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <motion.svg
        {...svgProps}
        animate={isListening ? hiddenState : visibleState}
        transition={iconTransition}
      >
        <rect x="9" y="1" width="6" height="12" rx="3" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v4" />
        <path d="M8 23h8" />
      </motion.svg>
      <motion.svg
        {...svgProps}
        animate={isListening ? visibleState : hiddenState}
        transition={iconTransition}
      >
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </motion.svg>
    </span>
  );
}
