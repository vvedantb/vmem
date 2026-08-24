import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { motion } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
import { landingItemVariants, landingShellClass } from "./LandingReveal";

const capabilities = ["Graph memory", "MCP", "HTTP API", "Skills"] as const;

const heroContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

export function LandingHero() {
  return (
    <section className={cnHero}>
      <motion.div
        className="mx-auto max-w-3xl text-center"
        initial="hidden"
        animate="show"
        variants={heroContainer}
      >
        <motion.p
          className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted sm:text-xs sm:tracking-[0.26em]"
          variants={landingItemVariants}
        >
          Memory engine for AI agents
        </motion.p>

        <motion.h1
          className="text-balance font-instrumentSerif text-[2.35rem] leading-[1] tracking-tight text-foreground min-[400px]:text-[2.85rem] sm:text-6xl lg:text-[4.85rem]"
          variants={landingItemVariants}
          transition={{ duration: motionDuration.slow, ease: motionEase }}
        >
          Memory your agents can{" "}
          <span className="italic text-foreground/85">actually use</span>
        </motion.h1>

        <motion.p
          className="mx-auto mt-5 max-w-xl text-pretty text-[0.9375rem] leading-relaxed text-muted sm:mt-6 sm:text-lg"
          variants={landingItemVariants}
        >
          Store context from chats and tools, connect it in a graph, and
          retrieve the slice that matters — with a Context Trace that shows why
          each memory matched.
        </motion.p>

        <motion.div
          className="mt-5 flex flex-wrap items-center justify-center gap-1.5 sm:mt-6 sm:gap-2"
          variants={landingItemVariants}
        >
          {capabilities.map((label, index) => (
            <span
              key={label}
              className={
                index === 0
                  ? "rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background sm:px-3 sm:text-xs"
                  : "rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted sm:px-3 sm:text-xs"
              }
            >
              {label}
            </span>
          ))}
        </motion.div>

        <motion.div
          className="mt-7 flex flex-col items-stretch justify-center gap-2.5 sm:mt-8 sm:flex-row sm:items-center sm:gap-3"
          variants={landingItemVariants}
        >
          <SignUpButton mode="modal">
            <Button size="lg" className="w-full sm:w-auto">
              Get started
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign in
            </Button>
          </SignInButton>
        </motion.div>
      </motion.div>
    </section>
  );
}

const cnHero = `${landingShellClass} pb-10 pt-8 sm:pb-14 sm:pt-16 lg:pb-16 lg:pt-20`;
