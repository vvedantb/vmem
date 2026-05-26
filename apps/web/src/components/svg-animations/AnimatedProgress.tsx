/**
 * Animated progress bar with gradient fill and smooth transitions.
 * Progress animates from 0 to target value on mount.
 */
"use client";

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

interface AnimatedProgressProps {
  /** Progress value from 0 to 100 */
  value: number;
  /** Height of the progress bar */
  height?: number;
  /** CSS class for the container */
  className?: string;
  /** Whether to show the animated gradient */
  showGradient?: boolean;
}

export function AnimatedProgress({
  value,
  height = 4,
  className,
  showGradient = true,
}: AnimatedProgressProps) {
  const springValue = useSpring(0, {
    stiffness: 100,
    damping: 30,
  });

  const width = useTransform(springValue, (v) => `${v}%`);

  useEffect(() => {
    springValue.set(Math.min(Math.max(value, 0), 100));
  }, [value, springValue]);

  return (
    <div
      className={className}
      style={{ height, overflow: "hidden", borderRadius: height / 2 }}
    >
      <svg width="100%" height={height} className="block">
        <defs>
          {/* Animated gradient */}
          <linearGradient
            id="progressGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="var(--accent)" />
            <stop
              offset="50%"
              stopColor="color-mix(in oklch, var(--accent) 80%, transparent)"
            />
            <stop offset="100%" stopColor="var(--accent)" />
            {showGradient && (
              <animate
                attributeName="x1"
                values="-100%;100%"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
            {showGradient && (
              <animate
                attributeName="x2"
                values="0%;200%"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>

          {/* Shimmer overlay */}
          <linearGradient
            id="progressShimmer"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="100%" stopColor="transparent" />
            <animate
              attributeName="x1"
              values="-50%;150%"
              dur="1.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="x2"
              values="0%;200%"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>

        {/* Background track */}
        <rect
          x="0"
          y="0"
          width="100%"
          height={height}
          rx={height / 2}
          fill="var(--surface-secondary)"
        />

        {/* Animated progress fill */}
        <motion.rect
          x="0"
          y="0"
          height={height}
          rx={height / 2}
          fill="url(#progressGradient)"
          style={{ width }}
        />

        {/* Shimmer effect on top */}
        {showGradient && value > 0 && (
          <motion.rect
            x="0"
            y="0"
            height={height}
            rx={height / 2}
            fill="url(#progressShimmer)"
            style={{ width }}
          />
        )}
      </svg>
    </div>
  );
}
