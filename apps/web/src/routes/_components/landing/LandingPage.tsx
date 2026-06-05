"use client";

import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { VmemDrawInIcon } from "@/components/svg-animations";
import { LandingAmbientGraph } from "./LandingAmbientGraph";
import { LandingHero } from "./LandingHero";
import { LandingHowItWorks } from "./LandingHowItWorks";
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

export function LandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const ambientY = useTransform(scrollY, [0, 480], [0, 56]);
  const ambientOpacity = useTransform(scrollY, [0, 320], [1, 0.72]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={
          prefersReducedMotion
            ? undefined
            : { y: ambientY, opacity: ambientOpacity }
        }
      >
        <LandingAmbientGraph />
      </motion.div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <motion.header
          className="group flex items-center gap-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          <VmemDrawInIcon size={34} className="text-foreground" />
          <span className="font-instrumentSerif text-xl tracking-tight text-foreground">
            vmem
          </span>
        </motion.header>

        <LandingHero features={features} capabilities={capabilities} />

        <LandingHowItWorks />

        <motion.footer
          className="mt-16 flex flex-col gap-3 pb-4 pt-4 sm:mt-20 sm:flex-row sm:items-center sm:justify-between"
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
