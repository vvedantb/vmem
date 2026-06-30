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
  /** Tap toggles multiple options; bars show share of all selections. */
  multiSelect?: boolean;
}

/**
 * A curated poll slide. In a live share session every viewer can tap options
 * and bars grow in real time. Checkmarks and counts come from Convex (not
 * localStorage) so tallies stay honest across reloads and format changes.
 */
export function SlidePoll({
  pollId,
  question,
  options,
  kicker,
  multiSelect = false,
}: SlidePollProps) {
  const { sessionCode, participantKey, hostKey } = usePresentationDeck();
  const live = sessionCode !== undefined;

  const results = useQuery(
    api.presentations.pollResults,
    sessionCode ? { code: sessionCode, pollId } : "skip",
  );
  const mySelections = useQuery(
    api.presentations.getMyPollSelections,
    sessionCode ? { code: sessionCode, pollId, participantKey } : "skip",
  );
  const sendVote = useMutation(api.presentations.sendVote);
  const togglePollOption = useMutation(api.presentations.togglePollOption);
  const clearPollVotes = useMutation(api.presentations.clearPollVotes);

  const selectedSet = new Set(mySelections ?? []);

  const voteSingle = (optionId: string) => {
    if (!sessionCode) return;
    void sendVote({
      code: sessionCode,
      pollId,
      participantKey,
      optionId,
    }).catch(() => undefined);
  };

  const voteMulti = (optionId: string) => {
    if (!sessionCode) return;
    void togglePollOption({
      code: sessionCode,
      pollId,
      participantKey,
      optionId,
    }).catch(() => undefined);
  };

  const resetPoll = () => {
    if (!sessionCode || !hostKey) return;
    void clearPollVotes({
      code: sessionCode,
      hostKey,
      pollId,
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
          const mine = selectedSet.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={!live}
              onClick={() =>
                multiSelect ? voteMulti(option.id) : voteSingle(option.id)
              }
              className={cn(
                "relative w-full overflow-hidden rounded-2xl px-5 py-4 text-left transition-[background-color]",
                live
                  ? "cursor-pointer hover:bg-surface-tertiary/70"
                  : "cursor-default",
                mine ? "bg-surface-tertiary" : "bg-surface-secondary/60",
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

      <SlideReveal
        delay={0.15}
        className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <p className="text-sm text-muted">
          {live
            ? multiSelect
              ? "Tap all that apply — results update live for everyone."
              : "Tap to vote — results update live for everyone."
            : "Share the deck to collect live votes."}
        </p>
        {live && hostKey ? (
          <button
            type="button"
            onClick={resetPoll}
            className="text-sm text-muted underline-offset-2 transition-[color] hover:text-foreground hover:underline"
          >
            Reset poll
          </button>
        ) : null}
      </SlideReveal>
    </SlideShell>
  );
}
