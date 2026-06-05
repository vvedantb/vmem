"use client";

import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { motion } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingFeatureCard } from "./LandingFeatureCard";

const features = [
  {
    icon: IconTopologyStar3,
    title: "Graph-native memory",
    description: "See context as a network — not a flat list of notes.",
    offsetClassName: "lg:translate-x-0",
  },
  {
    icon: IconBrain,
    title: "Built for recall",
    description: "Episodic, knowledge, and profile memories that persist.",
    offsetClassName: "lg:translate-x-6",
  },
  {
    icon: IconBolt,
    title: "Agent-ready",
    description: "MCP, HTTP API, and skills your agents can call.",
    offsetClassName: "lg:translate-x-3",
  },
] as const;

const capabilities = ["Graph memory", "MCP", "HTTP API", "Skills"] as const;

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <LandingAmbientGraph />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <motion.header
          className="flex items-center gap-3"
          {...fadeUp}
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          <img
            src="/icon.png"
            alt=""
            width={36}
            height={36}
            className="rounded-lg outline outline-1 outline-black/10 dark:outline-white/10"
          />
          <span className="font-instrumentSerif text-lg tracking-tight text-foreground">
            vmem
          </span>
        </motion.header>

        <div className="flex flex-col gap-12 py-10 sm:gap-14 sm:py-14 lg:flex-row lg:items-start lg:justify-between lg:gap-10 lg:py-20">
          <div className="max-w-xl lg:pt-2">
            <motion.p
              className="mb-4 text-xs font-medium uppercase tracking-[0.24em] text-muted"
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
              className="text-balance font-instrumentSerif text-[2.75rem] leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-[4.5rem]"
              {...fadeUp}
              transition={{
                duration: motionDuration.slow,
                ease: motionEase,
                delay: 0.1,
              }}
            >
              Memory your agents can{" "}
              <span className="italic text-foreground/90">actually use</span>
            </motion.h1>

            <motion.p
              className="mt-6 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg"
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
              className="mt-5 flex flex-wrap gap-2"
              {...fadeUp}
              transition={{
                duration: motionDuration.base,
                ease: motionEase,
                delay: 0.22,
              }}
            >
              {capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-full bg-surface px-3 py-1 text-xs text-muted"
                >
                  {cap}
                </span>
              ))}
            </motion.div>

            <motion.div
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
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
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Sign in
                </Button>
              </SignInButton>
            </motion.div>
          </div>

          <motion.div
            className="w-full lg:w-[min(100%,24rem)] lg:shrink-0 lg:pt-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: motionDuration.slow,
              ease: motionEase,
              delay: 0.34,
            }}
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Why vmem
            </p>
            <div className="flex flex-col gap-2.5">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: motionDuration.base,
                    ease: motionEase,
                    delay: 0.4 + index * 0.07,
                  }}
                >
                  <LandingFeatureCard {...feature} index={index} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.footer
          className="pb-4 pt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.55,
          }}
        >
          <button
            type="button"
            className="text-sm text-muted underline-offset-4 transition-[color] hover:text-foreground hover:underline"
            onClick={() => {
              window.location.href = "/api/auth/agent-login";
            }}
          >
            Continue without an account →
          </button>
        </motion.footer>
      </div>
    </div>
  );
}
