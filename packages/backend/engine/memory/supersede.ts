import type { MemoryWithTags } from "@vmem/sdk";
import { computeContentHash } from "./hash";
import { isVisibleStatus } from "./scope";
import { contentTokens, uniqueTokens } from "./tokens";

export const UPDATES_LINK_REASON = "updates";
export const SUPERSEDE_JACCARD = 0.6;

export type FactDecisionEvent = "ADD" | "UPDATE" | "DELETE" | "NONE";

export interface FactDecision {
  event: FactDecisionEvent;
  targetId?: string;
  text: string;
  oldMemory?: string;
}

export interface DecisionCandidate {
  id: string;
  title: string;
  content: string;
  contentHash?: string;
  status?: string;
}

export function instructionTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Instruction";
  return trimmed.slice(0, 80);
}

export function instructionContentHash(text: string): string {
  const trimmed = text.trim();
  return computeContentHash(instructionTitle(trimmed), trimmed);
}

function tokenSet(title: string, content: string): Set<string> {
  return new Set(uniqueTokens(contentTokens(`${title}\n${content}`, true)));
}

export function textJaccard(
  left: Pick<DecisionCandidate, "title" | "content">,
  right: Pick<DecisionCandidate, "title" | "content">,
): number {
  const a = tokenSet(left.title, left.content);
  const b = tokenSet(right.title, right.content);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / (a.size + b.size - overlap);
}

function candidateHash(candidate: DecisionCandidate): string {
  return (
    candidate.contentHash ??
    computeContentHash(candidate.title, candidate.content)
  );
}

export function visibleDecisionCandidates(
  memories: readonly Pick<
    MemoryWithTags,
    "id" | "title" | "content" | "status"
  >[],
): DecisionCandidate[] {
  const out: DecisionCandidate[] = [];
  for (const memory of memories) {
    if (!isVisibleStatus(memory.status)) continue;
    out.push({
      id: memory.id,
      title: memory.title,
      content: memory.content,
      status: memory.status,
    });
  }
  return out;
}

export function findExactHashMatch(
  text: string,
  candidates: readonly DecisionCandidate[],
): DecisionCandidate | undefined {
  const hash = instructionContentHash(text);
  const contentHash = computeContentHash("", text.trim());
  for (const candidate of candidates) {
    if (candidateHash(candidate) === hash) return candidate;
    if (computeContentHash("", candidate.content) === contentHash) {
      return candidate;
    }
  }
  return undefined;
}

function bestJaccardMatch(
  text: string,
  candidates: readonly DecisionCandidate[],
): { candidate: DecisionCandidate; score: number } | undefined {
  const probe = {
    title: instructionTitle(text),
    content: text.trim(),
  };
  let best: { candidate: DecisionCandidate; score: number } | undefined;
  for (const candidate of candidates) {
    const score = textJaccard(probe, candidate);
    if (best === undefined || score > best.score) {
      best = { candidate, score };
    }
  }
  return best;
}

export function decideFactDeterministic(
  text: string,
  candidates: readonly DecisionCandidate[],
): FactDecision {
  const trimmed = text.trim();
  const exact = findExactHashMatch(trimmed, candidates);
  if (exact) {
    return { event: "NONE", targetId: exact.id, text: trimmed };
  }
  const best = bestJaccardMatch(trimmed, candidates);
  if (best !== undefined && best.score >= SUPERSEDE_JACCARD) {
    return {
      event: "UPDATE",
      targetId: best.candidate.id,
      text: trimmed,
      oldMemory: best.candidate.content,
    };
  }
  return { event: "ADD", text: trimmed };
}

const NEAR_MATCH_LIMIT = 5;

/**
 * Visible memories whose title + content overlap the probe at the supersede
 * threshold (word Jaccard, no LLM), best match first. memory_add returns
 * them as possible conflicts; it does not retire them.
 */
export function findNearMatches<
  T extends Pick<MemoryWithTags, "id" | "title" | "content" | "status">,
>(
  probe: Pick<DecisionCandidate, "title" | "content">,
  memories: readonly T[],
  limit: number = NEAR_MATCH_LIMIT,
): T[] {
  return memories
    .filter((memory) => isVisibleStatus(memory.status))
    .map((memory) => ({ memory, score: textJaccard(probe, memory) }))
    .filter(({ score }) => score >= SUPERSEDE_JACCARD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}
