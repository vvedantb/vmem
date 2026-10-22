import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactSecrets } from "./text.ts";
import type { NormalizedRun, Outcome } from "./types.ts";

/** One run as an episodic memory. The store is local JSONL only. */
export interface Episode {
  id: string;
  groupId: string;
  text: string;
  outcome: Outcome;
  orderHint: number | null;
  source: string;
}

/** Text an episode stores and the lesson extractor reads. Secrets redacted. */
function episodeText(run: NormalizedRun): string {
  const sections = [
    `## Task prompt\n${run.taskPrompt}`,
    run.userFeedback.length > 0
      ? `## Later user messages (oldest first)\n${run.userFeedback
          .map((text, i) => `[${i + 1}] ${text}`)
          .join("\n\n")}`
      : "## Later user messages\n(none)",
    `## Trajectory (oldest first; assistant text, thinking, tool calls, results and errors)\n${run.trajectory.join("\n") || "(none)"}`,
    `## Verifier result\n${run.outcome}`,
  ];
  return redactSecrets(sections.join("\n\n"));
}

export function toEpisode(run: NormalizedRun, groupId: string): Episode {
  return {
    id: `ep-${run.hash}`,
    groupId,
    text: episodeText(run),
    outcome: run.outcome,
    orderHint: run.orderHint,
    source: run.file,
  };
}

export function writeEpisodes(
  filePath: string,
  episodes: readonly Episode[],
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    episodes.map((episode) => `${JSON.stringify(episode)}\n`).join(""),
  );
}
