import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import MemoryScoreBar from "@/components/_components/MemoryScoreBar";
import {
  demoQueries,
  memoryById,
  queryById,
  type DemoQuery,
  type DemoQueryHit,
} from "./landing-preview-data";
import {
  LandingReveal,
  LandingRevealItem,
  LandingSectionEyebrow,
  landingShellClass,
} from "./LandingReveal";

export function LandingRecallDemo() {
  const [queryId, setQueryId] = useState("editor");
  const [openHit, setOpenHit] = useState<string | null>("profile");
  const query = queryById(queryId);

  const selectQuery = (id: string) => {
    setQueryId(id);
    setOpenHit(queryById(id).hits[0]?.memoryId ?? null);
  };

  return (
    <section
      id="recall"
      className={cn(landingShellClass, "scroll-mt-24 py-16 sm:py-24")}
    >
      <LandingReveal className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
        <div>
          <LandingRevealItem>
            <LandingSectionEyebrow>Recall</LandingSectionEyebrow>
          </LandingRevealItem>
          <LandingRevealItem>
            <h2 className="max-w-md text-balance font-instrumentSerif text-3xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Ask like an agent would
            </h2>
          </LandingRevealItem>
          <LandingRevealItem>
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted sm:text-base">
              Hybrid search mixes fulltext, vectors, chunks, entities, and one
              hop of graph expansion. Every hit ships a Context Trace so you can
              see why it matched.
            </p>
          </LandingRevealItem>
          <LandingRevealItem>
            <div className="mt-6 flex flex-wrap gap-2">
              {demoQueries.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={item.id === queryId ? "default" : "secondary"}
                  onClick={() => selectQuery(item.id)}
                  className="rounded-full px-3.5"
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </LandingRevealItem>
        </div>

        <LandingRevealItem>
          <div className="overflow-hidden rounded-[1.5rem] bg-surface p-2 shadow-soft outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
            <div className="rounded-2xl bg-surface-secondary px-3.5 py-3 font-mono text-[11px] leading-relaxed text-muted sm:text-xs">
              <span className="text-foreground/70">mcp</span>{" "}
              <span className="text-foreground">memory.retrieve</span>
              <span className="text-muted">
                ({JSON.stringify(query.query)})
              </span>
            </div>
            <div className="min-h-[18rem] px-2 py-3 sm:px-3">
              <motion.div
                key={query.id}
                className="flex flex-col gap-1.5"
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.08 } },
                }}
              >
                {query.hits.map((hit) => (
                  <motion.div
                    key={hit.memoryId}
                    variants={{
                      hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
                      show: {
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                        transition: {
                          duration: motionDuration.base,
                          ease: motionEase,
                        },
                      },
                    }}
                  >
                    <RecallHit
                      query={query}
                      hit={hit}
                      isOpen={openHit === hit.memoryId}
                      onToggle={() =>
                        setOpenHit((current) =>
                          current === hit.memoryId ? null : hit.memoryId,
                        )
                      }
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </LandingRevealItem>
      </LandingReveal>
    </section>
  );
}

function RecallHit({
  query,
  hit,
  isOpen,
  onToggle,
}: {
  query: DemoQuery;
  hit: DemoQueryHit;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const memory = memoryById(hit.memoryId);
  const topScore = query.hits[0]?.score ?? 1;
  const pct = Math.round((hit.score / topScore) * 100);

  return (
    <div className="rounded-xl bg-background/60">
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {memory.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted underline decoration-dotted decoration-muted/40 underline-offset-2">
          {pct}%
        </span>
      </Button>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{
              opacity: 0,
              y: -8,
              filter: "blur(4px)",
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            transition={{ duration: motionDuration.fast, ease: motionEase }}
            className="px-3 pb-3"
          >
            <p className="mb-3 text-pretty text-xs leading-relaxed text-muted">
              {memory.content}
            </p>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted">
                Retrieval score
              </span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {hit.trace.score.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <MemoryScoreBar
                label="Content match"
                value={hit.trace.scoreBreakdown.fulltext}
              />
              <MemoryScoreBar
                label="Semantic match"
                value={hit.trace.scoreBreakdown.vector}
              />
              <MemoryScoreBar
                label="Recency"
                value={hit.trace.scoreBreakdown.recency}
              />
              <MemoryScoreBar
                label="Confidence"
                value={hit.trace.scoreBreakdown.confidence}
              />
              {hit.trace.scoreBreakdown.chunk > 0 ? (
                <MemoryScoreBar
                  label="Chunk match"
                  value={hit.trace.scoreBreakdown.chunk}
                />
              ) : null}
              {hit.trace.scoreBreakdown.entity > 0 ? (
                <MemoryScoreBar
                  label="Entity match"
                  value={hit.trace.scoreBreakdown.entity}
                />
              ) : null}
            </div>
            <p className="mt-3 text-[11px] italic leading-snug text-muted">
              {hit.trace.reason}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
