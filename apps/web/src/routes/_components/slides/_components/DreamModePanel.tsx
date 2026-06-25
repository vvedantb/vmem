import { useContext } from "react";
import type { ComponentType } from "react";
import { IconMoonStars, IconCheck } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

export interface DreamOutputRow {
  icon: ComponentType<IconProps>;
  kind: string;
  example: string;
}

const STATUS_ITEMS = [
  "Quiet for 30 minutes",
  "At least 5 new memories",
  "Proposes changes only — never silent overwrite",
] as const;

const cardSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
};

/**
 * ?slide=11 — dream output rows, then a moon-tinted status checklist.
 */
export function DreamModePanel({ outputs }: { outputs: DreamOutputRow[] }) {
  const step = useContext(SlideStepContext);
  const reduceMotion = useReducedMotion();
  const rowsLive = step >= 1;
  const statusLive = step >= 2;

  return (
    <div className="mt-5">
      <div className="space-y-2.5">
        {outputs.map((output, i) => {
          const Icon = output.icon;

          return (
            <motion.div
              key={output.kind}
              className="flex gap-4 rounded-2xl bg-surface-secondary/60 px-5 py-3"
              initial={{ opacity: 0, y: 12 }}
              animate={rowsLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={
                reduceMotion === true
                  ? { duration: 0 }
                  : { ...cardSpring, delay: i * 0.08 }
              }
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={15} stroke={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {output.kind}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {output.example}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        className="mt-4 rounded-2xl bg-surface-secondary/50 px-5 py-3"
        initial={{ opacity: 0, y: 8 }}
        animate={statusLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{
          duration: reduceMotion === true ? 0 : motionDuration.slow,
          ease: motionEase,
        }}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <IconMoonStars size={16} stroke={1.5} />
          <span>While you are away</span>
        </div>
        <ul className="space-y-2">
          {STATUS_ITEMS.map((item, i) => (
            <motion.li
              key={item}
              className="flex items-center gap-2.5 text-sm text-foreground"
              initial={{ opacity: 0, x: -6 }}
              animate={
                statusLive ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }
              }
              transition={{
                duration: reduceMotion === true ? 0 : motionDuration.base,
                delay: reduceMotion === true ? 0 : i * 0.1,
                ease: motionEase,
              }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <IconCheck size={12} stroke={2.5} />
              </span>
              {item}
            </motion.li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-foreground">Up to 4 runs per day.</p>
      </motion.div>
    </div>
  );
}
