import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { LandingFeatureCard } from "./LandingFeatureCard";
import {
  LandingReveal,
  LandingRevealItem,
  LandingSectionEyebrow,
  landingShellClass,
} from "./LandingReveal";

const steps = [
  {
    index: "01",
    title: "Store",
    description:
      "Capture context from chat, tools, and HTTP — tagged by profile, so workspaces stay separate.",
  },
  {
    index: "02",
    title: "Connect",
    description:
      "Memories link in a graph. Relationships survive between sessions instead of sitting in a flat list.",
  },
  {
    index: "03",
    title: "Recall",
    description:
      "Agents pull the right slice via MCP, skills, or the API — and get a Context Trace with the answer.",
  },
] as const;

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

export function LandingHowItWorks() {
  return (
    <section className={`${landingShellClass} py-16 sm:py-24`}>
      <LandingReveal>
        <LandingRevealItem>
          <LandingSectionEyebrow>How it works</LandingSectionEyebrow>
        </LandingRevealItem>
        <LandingRevealItem>
          <h2 className="max-w-lg text-balance font-instrumentSerif text-3xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Store, connect, then recall
          </h2>
        </LandingRevealItem>

        <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
          {steps.map((step, index) => (
            <LandingRevealItem key={step.title}>
              <div className="relative min-w-0">
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden
                    className="landing-step-rule pointer-events-none absolute left-[2.25rem] top-5 hidden h-px bg-separator md:block lg:left-[2.75rem]"
                    style={{ width: "calc(100% - 1rem)" }}
                  />
                ) : null}
                <p className="font-instrumentSerif text-2xl tabular-nums text-muted/50 sm:text-3xl">
                  {step.index}
                </p>
                <p className="mt-1.5 text-base font-medium text-foreground sm:mt-2">
                  {step.title}
                </p>
                <p className="mt-1 max-w-xs text-pretty text-sm leading-relaxed text-muted sm:mt-1.5">
                  {step.description}
                </p>
              </div>
            </LandingRevealItem>
          ))}
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {features.map((feature) => (
            <LandingRevealItem key={feature.title}>
              <LandingFeatureCard {...feature} />
            </LandingRevealItem>
          ))}
        </div>
      </LandingReveal>
    </section>
  );
}
