"use client";

import { useSyncExternalStore } from "react";
import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { motion, useScroll, useTransform } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { VmemBrand } from "@/components/VmemBrand";
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

const narrowMediaQuery = "(max-width: 1023px)";

function subscribeNarrowViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(narrowMediaQuery);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getNarrowViewportSnapshot() {
  return window.matchMedia(narrowMediaQuery).matches;
}

function getNarrowViewportServerSnapshot() {
  return false;
}

export function LandingPage() {
  const isNarrowViewport = useSyncExternalStore(
    subscribeNarrowViewport,
    getNarrowViewportSnapshot,
    getNarrowViewportServerSnapshot,
  );
  const { scrollY } = useScroll();
  const ambientY = useTransform(scrollY, [0, 480], [0, 56]);
  const ambientOpacity = useTransform(scrollY, [0, 320], [1, 0.72]);
  const parallaxEnabled = !isNarrowViewport;

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={
          parallaxEnabled ? { y: ambientY, opacity: ambientOpacity } : undefined
        }
      >
        <LandingAmbientGraph />
      </motion.div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <motion.header
          className="group"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          <VmemBrand />
        </motion.header>

        <LandingHero features={features} capabilities={capabilities} />

        <LandingHowItWorks />

        <motion.footer
          className="mt-12 flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:mt-16 sm:flex-row sm:items-center sm:justify-between md:mt-20"
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
