import { useContext } from "react";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";

export interface TraceMatchRow {
  label: string;
  score: string;
  reason: string;
}

function parseScore(score: string): number {
  const value = Number.parseFloat(score);
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * ?slide=9 — score bars grow in under each match reason; top score gets a ring.
 */
export function TraceMatchPanel({
  rows,
  footer,
}: {
  rows: TraceMatchRow[];
  footer?: string;
}) {
  const step = useContext(SlideStepContext);
  const live = step >= 1;
  const footerLive = step >= 2;

  const topScore = rows.reduce(
    (best, row) => {
      const value = parseScore(row.score);
      return value > best.value ? { label: row.label, value } : best;
    },
    { label: "", value: 0 },
  );

  return (
    <div className="mt-5 rounded-2xl bg-surface-secondary/60 px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/70">
          Search result — why it matched
        </p>
        <p className="shrink-0 font-mono text-xs text-foreground/60">
          1 match · 4 reasons
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const fraction = parseScore(row.score);
          const isTop =
            live && row.label === topScore.label && topScore.value > 0;
          const barDelay = i * 0.1;

          return (
            <motion.div
              key={row.label}
              className={`rounded-xl px-3 py-2.5 ${
                isTop ? "bg-surface-tertiary" : "bg-surface-secondary/80"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={live ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{
                duration: motionDuration.base,
                delay: barDelay,
                ease: motionEase,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="rounded bg-foreground/10 px-2 py-0.5 font-mono text-[10px] uppercase text-foreground">
                  {row.label}
                </span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {row.score}
                </span>
              </div>
              <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/8">
                <motion.div
                  className="h-full origin-left rounded-full bg-foreground/45"
                  initial={{ scaleX: 0 }}
                  animate={live ? { scaleX: fraction } : { scaleX: 0 }}
                  transition={{
                    duration: 0.55,
                    delay: barDelay + 0.06,
                    ease: motionEase,
                  }}
                />
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {row.reason}
              </p>
            </motion.div>
          );
        })}
      </div>

      {footer ? (
        <motion.p
          className="mt-4 text-base leading-relaxed text-foreground"
          initial={{ opacity: 0, y: 6 }}
          animate={footerLive ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{
            duration: motionDuration.base,
            ease: motionEase,
          }}
        >
          {footer}
        </motion.p>
      ) : null}
    </div>
  );
}
