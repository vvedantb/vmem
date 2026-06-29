import { useContext } from "react";
import type { ComponentType } from "react";
import { motion, useReducedMotion } from "motion/react";
import { IconMemories } from "@/components/sidebar-icons";
import { SlideStepContext } from "./SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

export interface CaptureSource {
  icon: ComponentType<IconProps>;
  title: string;
  items: string[];
}

const cardSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
};

/**
 * ?slide=10 — four source cards, then a centred memory-store banner on step 2.
 */
export function CaptureSourcesPanel({ sources }: { sources: CaptureSource[] }) {
  const step = useContext(SlideStepContext);
  const reduceMotion = useReducedMotion();
  const cardsLive = step >= 1;
  const bannerLive = step >= 2;

  return (
    <div className="mt-8">
      <div className="grid grid-cols-4 gap-4">
        {sources.map((source, i) => {
          const Icon = source.icon;

          return (
            <motion.div
              key={source.title}
              className="flex flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4"
              initial={{ opacity: 0, y: 14 }}
              animate={cardsLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              transition={
                reduceMotion === true
                  ? { duration: 0 }
                  : { ...cardSpring, delay: i * 0.06 }
              }
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={16} stroke={1.5} />
              </div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {source.title}
              </p>
              <ul className="space-y-1.5">
                {source.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                    <span className="text-xs leading-relaxed text-foreground">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        className="mx-auto mt-6 flex w-fit items-center gap-3 rounded-2xl bg-foreground px-6 py-3.5 text-background"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={
          bannerLive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }
        }
        transition={
          reduceMotion === true
            ? { duration: 0 }
            : { ...cardSpring, delay: 0.08 }
        }
      >
        <IconMemories size={18} stroke={1.5} />
        <span className="text-sm font-medium">One memory store</span>
      </motion.div>
    </div>
  );
}
