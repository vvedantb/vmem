"use client";

import { memo, type ElementType } from "react";
import { motion } from "motion/react";
import { cn } from "../utils/cn";

interface ShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const Shimmer = memo(function Shimmer({
  children,
  as: Component = "span",
  className,
  duration = 2,
  spread = 2,
}: ShimmerProps) {
  const MotionComponent = motion.create(Component);
  const totalSpread = spread * children.length;

  return (
    <MotionComponent
      className={cn(
        "inline-block bg-clip-text text-transparent [-webkit-text-fill-color:transparent]",
        className,
      )}
      style={
        {
          "--spread": `${totalSpread}px`,
          "--bg": `linear-gradient(
            90deg,
            var(--muted) 0%,
            var(--foreground) calc(50% - var(--spread)),
            var(--muted) 50%,
            var(--foreground) calc(50% + var(--spread)),
            var(--muted) 100%
          )`,
          backgroundImage: "var(--bg)",
          backgroundSize: "200% 100%",
        } as React.CSSProperties & Record<string, string>
      }
      animate={{ backgroundPosition: ["100% center", "0% center"] }}
      transition={{
        duration,
        ease: "linear",
        repeat: Infinity,
      }}
    >
      {children}
    </MotionComponent>
  );
});

export { Shimmer, type ShimmerProps };
