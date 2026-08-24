import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";

export const landingShellClass =
  "relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12";

export const landingItemVariants: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: motionDuration.slow, ease: motionEase },
  },
};

interface LandingRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function LandingReveal({
  children,
  className,
  delay = 0,
}: LandingRevealProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.1, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function LandingRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={cn(className)} variants={landingItemVariants}>
      {children}
    </motion.div>
  );
}

export function LandingSectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted sm:text-xs sm:tracking-[0.22em]">
      {children}
    </p>
  );
}
