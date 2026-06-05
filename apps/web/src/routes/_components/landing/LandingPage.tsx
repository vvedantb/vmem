"use client";

import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { motion } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
import { VmemDrawInIcon } from "@/components/svg-animations";
import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingFeatureCard } from "./LandingFeatureCard";
import { LandingMemoryPreview } from "./LandingMemoryPreview";
import "./landing.css";

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
    offsetClassName: "lg:translate-x-5",
  },
  {
    icon: IconBolt,
    title: "Agent-ready",
    description: "MCP, HTTP API, and skills your agents can call.",
    offsetClassName: "lg:translate-x-2.5",
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

      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <motion.header
          className="group flex items-center gap-3"
          {...fadeUp}
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          <VmemDrawInIcon size={34} className="text-foreground" />
          <span className="font-instrumentSerif text-xl tracking-tight text-foreground">
            vmem
          </span>
        </motion.header>

        <div className="flex flex-col gap-12 py-10 sm:gap-14 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,26rem)] lg:items-start lg:gap-14 lg:py-20 xl:gap-16">
          <div className="max-w-xl lg:pt-1">
            <motion.p
              className="mb-4 text-xs font-medium uppercase tracking-[0.26em] text-muted"
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
              className="text-balance font-instrumentSerif text-[2.75rem] leading-[0.98] tracking-tight text-foreground sm:text-6xl lg:text-[4.75rem]"
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
              className="mt-6 flex flex-wrap items-center gap-2"
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
                      ? "rounded-full bg-foreground px-3 py-1 text-xs text-background"
                      : "rounded-full bg-surface px-3 py-1 text-xs text-muted"
                  }
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

            <motion.div
              className="mt-10 lg:hidden"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: motionDuration.slow,
                ease: motionEase,
                delay: 0.34,
              }}
            >
              <LandingMemoryPreview />
            </motion.div>
          </div>

          <motion.div
            className="flex w-full flex-col gap-6 lg:sticky lg:top-10 lg:pt-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: motionDuration.slow,
              ease: motionEase,
              delay: 0.34,
            }}
          >
            <div className="hidden lg:block">
              <LandingMemoryPreview />
            </div>

            <div>
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
                      delay: 0.42 + index * 0.07,
                    }}
                  >
                    <LandingFeatureCard {...feature} index={index} />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.footer
          className="flex flex-col gap-3 pb-4 pt-8 sm:flex-row sm:items-center sm:justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
            delay: 0.55,
          }}
        >
          <p className="max-w-sm text-pretty text-xs leading-relaxed text-muted">
            Graph storage, vector recall, and MCP-ready integrations for any
            agent stack.
          </p>
          <button
            type="button"
            className="shrink-0 text-left text-sm text-muted underline-offset-4 transition-[color] hover:text-foreground hover:underline sm:text-right"
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
