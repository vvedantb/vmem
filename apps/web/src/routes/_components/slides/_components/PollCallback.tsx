import { useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import { usePresentationDeck } from "./PresentationDeckContext";
import type { PollDef } from "./pollDefs";

/**
 * Live callback to an earlier poll: shows the audience's top answer for `poll`
 * as a small chip. Renders nothing unless a live share session has votes — so
 * the slide looks normal when presenting solo.
 */
export function PollCallback({
  poll,
  prefix = "You said",
}: {
  poll: PollDef;
  prefix?: string;
}) {
  const { sessionCode } = usePresentationDeck();
  const results = useQuery(
    api.presentations.pollResults,
    sessionCode ? { code: sessionCode, pollId: poll.pollId } : "skip",
  );
  if (!sessionCode || !results || results.total === 0) return null;

  const top = [...results.options].sort((a, b) => b.count - a.count)[0];
  if (!top) return null;
  const label =
    poll.options.find((o) => o.id === top.optionId)?.label ?? top.optionId;
  const pct = Math.round((top.count / results.total) * 100);

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full bg-surface-secondary/70 px-4 py-2">
      <motion.span
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="text-sm text-muted">{prefix}</span>
      <span className="text-sm font-medium text-foreground">
        {pct}% · {label}
      </span>
    </div>
  );
}
