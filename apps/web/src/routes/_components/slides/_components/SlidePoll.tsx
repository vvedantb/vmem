import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { IconCheck } from "@tabler/icons-react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { api } from "@vmem/backend";
import { SlideShell, SlideKicker, SlideTitle, SlideReveal } from "./SlideShell";
import { usePresentationDeck } from "./PresentationDeckContext";

interface PollOption {
  id: string;
  label: string;
}

interface SlidePollProps {
  /** Stable id — votes are scoped by (session code, pollId). Never reuse. */
  pollId: string;
  question: string;
  options: PollOption[];
  kicker?: string;
}

const voteStorageKey = (code: string, pollId: string) =>
  `vmem:poll-vote:${code}:${pollId}`;

/**
 * A curated poll slide. In a live share session every viewer can tap an option
 * and the bars grow in real time (Convex reactive tally) — one vote per
 * browser (`participantKey`), re-tapping changes it. With no session (solo
 * deck) it renders statically with a hint to share.
 */
export function SlidePoll({
  pollId,
  question,
  options,
  kicker,
}: SlidePollProps) {
  const { sessionCode, participantKey } = usePresentationDeck();
  const live = sessionCode !== undefined;

  const results = useQuery(
    api.presentations.pollResults,
    sessionCode ? { code: sessionCode, pollId } : "skip",
  );
  const sendVote = useMutation(api.presentations.sendVote);

  // Own choice — drives the highlight, persisted so a reload keeps it. The
  // server upsert (keyed by participantKey) is the source of truth for counts.
  const [myOption, setMyOption] = useState<string | null>(() =>
    sessionCode && typeof window !== "undefined"
      ? window.localStorage.getItem(voteStorageKey(sessionCode, pollId))
      : null,
  );
  useEffect(() => {
    if (!sessionCode || typeof window === "undefined") {
      setMyOption(null);
      return;
    }
    setMyOption(
      window.localStorage.getItem(voteStorageKey(sessionCode, pollId)),
    );
  }, [sessionCode, pollId]);

  const vote = (optionId: string) => {
    if (!sessionCode) return;
    setMyOption(optionId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        voteStorageKey(sessionCode, pollId),
        optionId,
      );
    }
    void sendVote({
      code: sessionCode,
      pollId,
      participantKey,
      optionId,
    }).catch(() => undefined);
  };

  const countByOption = new Map(
    results?.options.map((option) => [option.optionId, option.count]),
  );
  const total = results?.total ?? 0;

  return (
    <SlideShell>
      <SlideReveal>
        <SlideKicker>{kicker ?? "Live poll"}</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.05}>
        <SlideTitle size="xl">{question}</SlideTitle>
      </SlideReveal>

      <div className="mt-10 flex flex-col gap-3">
        {options.map((option) => {
          const count = countByOption.get(option.id) ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          const mine = myOption === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!live}
              onClick={() => vote(option.id)}
              className={cn(
                "relative w-full overflow-hidden rounded-2xl px-5 py-4 text-left transition-[background-color]",
                live
                  ? "cursor-pointer hover:bg-surface-tertiary/70"
                  : "cursor-default",
                mine
                  ? "bg-surface-tertiary ring-2 ring-foreground/25"
                  : "bg-surface-secondary/60",
              )}
            >
              {live && (
                <motion.div
                  className="absolute inset-y-0 left-0 bg-foreground/10"
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    duration: motionDuration.base,
                    ease: motionEase,
                  }}
                  aria-hidden
                />
              )}
              <div className="relative flex items-center justify-between gap-4">
                <span className="flex items-center gap-2.5 text-base text-foreground">
                  {mine && (
                    <IconCheck size={16} className="shrink-0 text-foreground" />
                  )}
                  {option.label}
                </span>
                {live && (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                    {count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <SlideReveal delay={0.15} className="mt-6">
        <p className="text-sm text-muted">
          {live
            ? "Tap to vote — results update live for everyone."
            : "Share the deck to collect live votes."}
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
