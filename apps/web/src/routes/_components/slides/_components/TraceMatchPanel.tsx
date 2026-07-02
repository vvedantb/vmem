import { useContext } from "react";
import { IconSearch } from "@tabler/icons-react";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import { SlideStepContext } from "./SlideShell";

export interface TraceMatchRow {
  label: string;
  score: string;
  reason: string;
}

export interface TraceMemory {
  text: string;
  source: string;
}

function parseScore(score: string): number {
  const value = Number.parseFloat(score);
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Context Trace panel, told as a real trace so the scores have something to
 * explain: the question you asked → the memory it brought back → why it matched,
 * each reason with a strength bar. The query + memory are always visible; the
 * "why it matched" reasons grow in on step 1, the footer on step 2.
 */
export function TraceMatchPanel({
  query,
  memory,
  rows,
  footer,
}: {
  query: string;
  memory: TraceMemory;
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
    <div className="rounded-2xl bg-surface-secondary/60 px-5 py-4">
      {/* The question */}
      <div className="flex items-center gap-2">
        <IconSearch size={14} stroke={1.75} className="shrink-0 text-muted" />
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
          You asked
        </span>
      </div>
      <p className="mt-1.5 text-base leading-snug text-foreground">
        &ldquo;{query}&rdquo;
      </p>

      {/* The memory it brought back */}
      <div className="mt-3 rounded-xl bg-surface px-4 py-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
          The memory it brought back
        </p>
        <p className="text-sm leading-relaxed text-foreground">{memory.text}</p>
        <p className="mt-1.5 text-xs text-muted">{memory.source}</p>
      </div>

      {/* Why it matched */}
      <div className="mb-2 mt-4 flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/70">
          Why it matched
        </p>
        <p className="shrink-0 font-mono text-xs text-muted">
          {rows.length} reasons
        </p>
      </div>

      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const fraction = parseScore(row.score);
          const isTop =
            live && row.label === topScore.label && topScore.value > 0;
          const barDelay = i * 0.12;

          return (
            <motion.div
              key={row.label}
              className={`rounded-lg px-3 py-2 ${
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
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-medium text-foreground">
                  {row.label}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <motion.div
                    className="h-full origin-left rounded-full bg-foreground/50"
                    initial={{ scaleX: 0 }}
                    animate={live ? { scaleX: fraction } : { scaleX: 0 }}
                    transition={{
                      duration: 0.55,
                      delay: barDelay + 0.06,
                      ease: motionEase,
                    }}
                  />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                  {Math.round(fraction * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
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
          transition={{ duration: motionDuration.base, ease: motionEase }}
        >
          {footer}
        </motion.p>
      ) : null}
    </div>
  );
}
