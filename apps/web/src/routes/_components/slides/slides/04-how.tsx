import type { ComponentType } from "react";
import {
  IconArrowRight,
  IconCapture,
  IconSparkles,
  IconGitFork,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { IconMemories } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

/**
 * A thin rail under the pipeline with a glowing token that travels
 * capture → enrich → graph → recall on a loop, so the stages read as a
 * flow rather than four static cards.
 */
function FlowRail() {
  return (
    <div className="relative mt-6 h-2">
      {/* Faint full-width track */}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10" />
      {/* Travelling token with a soft comet glow */}
      <motion.div
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-foreground"
        style={{
          boxShadow:
            "0 0 12px 3px color-mix(in oklch, var(--foreground) 45%, transparent)",
        }}
        initial={{ left: "0%" }}
        animate={{ left: ["0%", "100%"] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: [0.45, 0, 0.55, 1],
          repeatDelay: 0.4,
        }}
      />
    </div>
  );
}

/** Minimal icon props that both @tabler/icons-react and sidebar icons satisfy. */
interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Step {
  index: string;
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const steps: Step[] = [
  {
    index: "01",
    icon: IconCapture,
    title: "Capture",
    body: "Chat, extension saves, file uploads, YouTube transcripts, HTTP POST — every surface writes to the same store.",
  },
  {
    index: "02",
    icon: IconSparkles,
    title: "Enrich",
    body: "Each memory gets tags (recurring themes), named entities, and a vector embedding via OpenRouter.",
  },
  {
    index: "03",
    icon: IconGitFork,
    title: "Graph",
    body: "Memories link to each other by semantic similarity, shared session, and LLM-detected content relations. Entities and tags become first-class nodes.",
  },
  {
    index: "04",
    icon: IconMemories,
    title: "Recall",
    body: "Agents pull context via MCP tools. Hybrid retrieval: vector kNN + graph traversal + entity match, with a scored trace.",
  },
];

export function Slide04How() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>How it works</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Four stages, one pipeline."]} size="xl" />
      <SlideReveal delay={0.1} className="mt-8">
        <SlideBody>
          Every memory passes through capture → enrich → graph → recall. Nothing
          is stored raw.
        </SlideBody>
      </SlideReveal>

      <FlowRail />

      {/* Each pipeline stage reveals on its own click step (1–4). */}
      <div className="mt-2 flex items-stretch gap-3">
        {steps.map(({ index, icon: Icon, title, body }, i) => (
          <SlideReveal
            key={title}
            step={i + 1}
            className="flex flex-1 items-stretch gap-3"
          >
            <div className="flex flex-1 flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-instrumentSerif text-2xl tabular-nums text-muted/50">
                  {index}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                  <Icon size={15} stroke={1.5} />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {body}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center">
                <IconArrowRight
                  size={16}
                  className="text-muted/40"
                  stroke={1.5}
                />
              </div>
            )}
          </SlideReveal>
        ))}
      </div>
    </SlideShell>
  );
}
