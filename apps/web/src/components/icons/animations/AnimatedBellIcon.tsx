// animated bell icon with swing animation for empty notification state

import { motion } from "motion/react";

interface AnimatedBellIconProps {
  size?: number;
  className?: string;
  muted?: boolean;
}

export function AnimatedBellIcon({
  size = 32,
  className,
  muted = true,
}: AnimatedBellIconProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      initial={{ rotate: 0 }}
      animate={{ rotate: [0, 10, -10, 8, -8, 5, -5, 0] }}
      transition={{
        duration: 1.5,
        ease: "easeInOut",
        repeat: Infinity,
        repeatDelay: 3,
      }}
      style={{ transformOrigin: "top center" }}
    >
      {/* Bell body */}
      <motion.path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />

      {/* Bell bottom curve */}
      <motion.path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      />

      {/* Mute slash line */}
      {muted && (
        <motion.path
          d="M2 2l20 20"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        />
      )}

      {/* Inner clapper circle with subtle movement */}
      <motion.circle
        cx="12"
        cy="17"
        r="0.5"
        fill="currentColor"
        animate={{ x: [0, 1, -1, 0.5, -0.5, 0] }}
        transition={{
          duration: 1.5,
          ease: "easeInOut",
          repeat: Infinity,
          repeatDelay: 3,
        }}
      />
    </motion.svg>
  );
}
