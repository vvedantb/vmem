import { IconBolt, IconBrain, IconTopologyStar3 } from "@tabler/icons-react";
import { LandingFeatureCard } from "./LandingFeatureCard";
import {
  LandingLattice,
  LandingReveal,
  LandingRevealItem,
  LandingSection,
  LandingSectionHeading,
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
    <LandingSection id="how">
      <LandingReveal>
        <LandingRevealItem>
          <LandingSectionHeading
            eyebrow="How it works"
            heading="Store, connect, then recall"
          />
        </LandingRevealItem>

        <LandingRevealItem className="mt-10">
          <LandingLattice className="md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.title} className="bg-background p-6 sm:p-7">
                <p className="font-mono text-[11px] tracking-[0.28em] text-muted">
                  {step.index}
                </p>
                <p className="mt-3 text-base font-medium text-foreground">
                  {step.title}
                </p>
                <p className="mt-1.5 max-w-xs text-pretty text-sm leading-relaxed text-muted">
                  {step.description}
                </p>
              </div>
            ))}
          </LandingLattice>
        </LandingRevealItem>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {features.map((feature) => (
            <LandingRevealItem key={feature.title}>
              <LandingFeatureCard {...feature} />
            </LandingRevealItem>
          ))}
        </div>
      </LandingReveal>
    </LandingSection>
  );
}
