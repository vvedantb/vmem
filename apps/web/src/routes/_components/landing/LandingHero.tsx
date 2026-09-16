import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight } from "@tabler/icons-react";
import { motion } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
import { LANDING_HERO_CAPABILITIES } from "./landingContent";
import { landingItemVariants, landingShellClass } from "./LandingReveal";

const heroContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

export function LandingHero() {
  return (
    <section
      className={`${landingShellClass} pb-16 pt-12 sm:pb-20 sm:pt-20 lg:pb-24 lg:pt-24`}
    >
      <motion.div
        className="mx-auto max-w-3xl text-center"
        initial="hidden"
        animate="show"
        variants={heroContainer}
      >
        <motion.p
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-separator bg-surface/70 px-3 py-1 text-xs text-muted"
          variants={landingItemVariants}
        >
          <span
            className="landing-pulse-dot size-1.5 rounded-full bg-danger"
            aria-hidden
          />
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
          className="mt-7 flex flex-col items-stretch justify-center gap-2.5 sm:mt-9 sm:flex-row sm:items-center sm:gap-3"
          variants={landingItemVariants}
        >
          <SignUpButton mode="modal">
            <Button size="lg" className="w-full sm:w-auto sm:min-w-40">
              Get started
              <IconArrowRight size={16} aria-hidden />
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign in
            </Button>
          </SignInButton>
        </motion.div>

        <motion.ul
          className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:mt-10"
          variants={landingItemVariants}
        >
          {LANDING_HERO_CAPABILITIES.map((label) => (
            <li
              key={label}
              className="rounded-full border border-separator bg-surface/60 px-3 py-1 font-mono text-[11px] text-muted"
            >
              {label}
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </section>
  );
}
