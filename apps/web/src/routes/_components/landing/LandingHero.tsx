"use client";

import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { motion } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
import { LandingAside } from "./LandingAside";
import type { TablerIcon } from "@tabler/icons-react";

interface LandingFeature {
  icon: TablerIcon;
  title: string;
  description: string;
  offsetClassName: string;
}

interface LandingHeroProps {
  features: readonly LandingFeature[];
  capabilities: readonly string[];
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function LandingHero({ features, capabilities }: LandingHeroProps) {
  return (
    <div className="flex flex-col gap-10 py-8 sm:gap-14 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,26rem)] lg:items-start lg:gap-14 lg:py-20 xl:gap-16">
      <div className="relative w-full min-w-0 max-w-xl lg:pt-1">
        <motion.p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted sm:mb-4 sm:text-xs sm:tracking-[0.26em]"
          {...fadeUp}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.05,
          }}
        >
          Memory engine for AI agents
        </motion.p>

        <motion.h1
          className="text-balance font-instrumentSerif text-[2.125rem] leading-[1] tracking-tight text-foreground min-[400px]:text-[2.75rem] min-[400px]:leading-[0.98] sm:text-6xl lg:text-[4.75rem]"
          {...fadeUp}
          transition={{
            duration: motionDuration.slow,
            ease: motionEase,
            delay: 0.1,
          }}
        >
          Memory your agents can{" "}
          <span className="italic text-foreground/85">actually use</span>
        </motion.h1>

        <motion.p
          className="mt-5 max-w-md text-pretty text-[0.9375rem] leading-relaxed text-muted sm:mt-6 sm:text-lg"
          {...fadeUp}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.18,
          }}
        >
          Store, connect, and retrieve context across chats, tools, and
          workflows — with a graph that shows how it all fits together.
        </motion.p>

        <motion.div
          className="mt-5 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-2"
          {...fadeUp}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.22,
          }}
        >
          {capabilities.map((cap, index) => (
            <span
              key={cap}
              className={
                index === 0
                  ? "rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background sm:px-3 sm:text-xs"
                  : "rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted sm:px-3 sm:text-xs"
              }
            >
              {cap}
            </span>
          ))}
        </motion.div>

        <motion.div
          className="mt-7 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:items-center sm:gap-3"
          {...fadeUp}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.28,
          }}
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
      </div>

      <div className="w-full min-w-0 lg:hidden">
        <LandingAside features={features} showPreview />
      </div>

      <div className="hidden min-w-0 lg:block">
        <LandingAside features={features} showPreview />
      </div>
    </div>
  );
}
