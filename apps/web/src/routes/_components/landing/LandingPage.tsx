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
  },
  {
    icon: IconBrain,
    title: "Built for recall",
    description: "Episodic, knowledge, and profile memories that persist.",
  },
  {
    icon: IconBolt,
    title: "Agent-ready",
    description: "MCP, HTTP API, and skills your agents can call.",
  },
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <LandingAmbientGraph />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
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
            className="rounded-lg"
          />
          <span className="text-sm font-medium tracking-wide text-muted">
            vmem
          </span>
        </motion.header>

        <div className="flex flex-1 flex-col justify-center gap-12 py-12 lg:flex-row lg:items-center lg:gap-20 lg:py-16">
          <div className="max-w-xl">
            <motion.p
              className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-muted"
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
              className="font-instrumentSerif text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]"
              {...fadeUp}
              transition={{
                duration: motionDuration.slow,
                ease: motionEase,
                delay: 0.1,
              }}
            >
              Memory your agents can actually use
            </motion.h1>

            <motion.p
              className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg"
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
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              {...fadeUp}
              transition={{
                duration: motionDuration.base,
                ease: motionEase,
                delay: 0.26,
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
            className="flex w-full flex-col gap-2.5 lg:max-w-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: motionDuration.slow,
              ease: motionEase,
              delay: 0.32,
            }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: motionDuration.base,
                  ease: motionEase,
                  delay: 0.38 + index * 0.06,
                }}
              >
                <LandingFeatureCard {...feature} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.footer
          className="pb-2 pt-4"
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
            className="text-sm text-muted transition-[color] hover:text-foreground"
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
