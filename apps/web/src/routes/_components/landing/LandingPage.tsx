import { useSyncExternalStore } from "react";
import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { motion, useScroll, useTransform } from "motion/react";
import { Button, motionDuration, motionEase } from "@vmem/ui";
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

const capabilities = [
  { label: "Graph memory", tone: "accent" },
  { label: "MCP", tone: "muted" },
  { label: "HTTP API", tone: "muted" },
  { label: "Skills", tone: "muted" },
] as const;

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

function LandingAmbientStatic() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <LandingAmbientGraph />
    </div>
  );
}

function LandingAmbientParallax() {
  const { scrollY } = useScroll();
  const ambientY = useTransform(scrollY, [0, 480], [0, 56]);
  const ambientOpacity = useTransform(scrollY, [0, 320], [1, 0.72]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ y: ambientY, opacity: ambientOpacity }}
    >
      <LandingAmbientGraph />
    </motion.div>
  );
}

function LandingAmbientLayer() {
  const isNarrowViewport = useSyncExternalStore(
    subscribeNarrowViewport,
    getNarrowViewportSnapshot,
    getNarrowViewportServerSnapshot,
  );

  if (isNarrowViewport) {
    return <LandingAmbientStatic />;
  }

  return <LandingAmbientParallax />;
}

export function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <LandingAmbientLayer />

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
          <Button
            type="button"
            variant="link"
            className="h-auto shrink-0 p-0 text-left text-sm text-muted hover:text-foreground sm:text-right active:scale-100"
            onClick={() => {
              window.location.href = "/api/auth/agent-login";
            }}
          >
            Continue without an account →
          </Button>
        </motion.footer>
      </div>
    </div>
  );
}
