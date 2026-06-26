import { useContext } from "react";
import type { ComponentType } from "react";
import { motion } from "motion/react";
import { IconMemories } from "@/components/sidebar-icons";
import { SlideStepContext } from "./SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

export interface MemorySource {
  icon: ComponentType<IconProps>;
  label: string;
}

const cardSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
};

/**
 * ?slide=5 — four capture surfaces in a row, then one inverted focal card for
 * "one memory store" (keynote-style single emphasis, no hub SVG).
 */
export function WhatMemoryFlow({ sources }: { sources: MemorySource[] }) {
  const step = useContext(SlideStepContext);
  const sourcesLive = step >= 2;
  const storeLive = step >= 3;

  return (
    <div className="mt-10">
      <div className="grid grid-cols-4 gap-4">
        {sources.map((source, i) => {
          const Icon = source.icon;

          return (
            <motion.div
              key={source.label}
              className="flex flex-col items-center rounded-2xl bg-surface-secondary/60 px-4 py-5"
              initial={{ opacity: 0, y: 16 }}
              animate={
                sourcesLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }
              }
              transition={{ ...cardSpring, delay: i * 0.07 }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={18} stroke={1.5} />
              </div>
              <p className="mt-3 text-center text-sm font-medium leading-snug text-foreground">
                {source.label}
              </p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        className="mt-6 overflow-hidden rounded-2xl bg-foreground px-8 py-7 text-background"
        initial={{ opacity: 0, y: 20 }}
        animate={storeLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ ...cardSpring, delay: 0.05 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-foreground">
            <IconMemories size={18} stroke={1.5} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-background/70">
            One memory store
          </p>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-background">
          Capture from one app, recall in another. A page saved in the browser
          shows up when you chat in Claude. Voice on your phone shows up on your
          laptop.
        </p>
      </motion.div>
    </div>
  );
}
