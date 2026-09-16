import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";

export const landingShellClass =
  "relative mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10";

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

export function LandingSection({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        landingShellClass,
        "scroll-mt-24 py-20 sm:py-28 lg:py-32",
        className,
      )}
    >
      {children}
    </section>
  );
}

function LandingSectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-danger sm:text-xs sm:tracking-[0.28em]">
      {children}
    </p>
  );
}

export function LandingSectionHeading({
  eyebrow,
  heading,
  intro,
  className,
}: {
  eyebrow: string;
  heading: string;
  intro?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <LandingSectionEyebrow>{eyebrow}</LandingSectionEyebrow>
      <h2 className="text-balance font-instrumentSerif text-3xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
        {heading}
      </h2>
      {intro ? (
        <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted sm:mt-5 sm:text-base">
          {intro}
        </p>
      ) : null}
    </div>
  );
}

/** Shared border through 1px gaps so adjacent cells don't double a hairline. */
export function LandingLattice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-separator">
      <div className={cn("grid gap-px bg-separator", className)}>
        {children}
      </div>
    </div>
  );
}

export const landingPanelClass =
  "overflow-hidden rounded-2xl border border-separator bg-surface";
