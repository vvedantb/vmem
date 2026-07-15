// morphing hamburger menu icon that transforms to X

import { motion } from "motion/react";

interface MorphingMenuIconProps {
  isOpen: boolean;
  size?: number;
  className?: string;
}

export function MorphingMenuIcon({
  isOpen,
  size = 20,
  className,
}: MorphingMenuIconProps) {
  const lineProps = {
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      {/* Top line - rotates to form top half of X */}
      <motion.line
        x1="4"
        y1="6"
        x2="20"
        y2="6"
        {...lineProps}
        animate={{
          x1: isOpen ? 5 : 4,
          y1: isOpen ? 5 : 6,
          x2: isOpen ? 19 : 20,
          y2: isOpen ? 19 : 6,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      />

      {/* Middle line - fades out */}
      <motion.line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        {...lineProps}
        animate={{
          opacity: isOpen ? 0 : 1,
          scaleX: isOpen ? 0 : 1,
        }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
        style={{ transformOrigin: "center" }}
      />

      {/* Bottom line - rotates to form bottom half of X */}
      <motion.line
        x1="4"
        y1="18"
        x2="20"
        y2="18"
        {...lineProps}
        animate={{
          x1: isOpen ? 5 : 4,
          y1: isOpen ? 19 : 18,
          x2: isOpen ? 19 : 20,
          y2: isOpen ? 5 : 18,
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      />
    </svg>
  );
}
