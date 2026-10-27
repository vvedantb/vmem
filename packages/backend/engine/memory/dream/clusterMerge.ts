import type { MemoryStatus } from "@vmem/sdk";
import { z } from "zod";
import { parseJsonString } from "../../llm/extractJsonString";
import { truncateAtWord } from "../../llm/truncateAtWord";

// AI judge for one candidate cluster of the one-off cleanup: which members
// hold the same information, which row to keep, and the one merged text the
// kept row gets. Pure: the caller makes the call (feature "dream", thinking
// off) and passes the reply here. Nightly dreaming keeps the Jev judge
// (jevDuplicate.ts).

// member content goes into the prompt up to this length. A merge with a
// longer member gets no merged text: the AI did not see all of it.
export const CLUSTER_MERGE_CONTENT_CHARS = 3_000;
// below this the cluster is not a duplicate (the same bar as Jev)
const CLUSTER_MERGE_MIN = 0.7;
const REASON_CHARS = 300;

export const CLUSTER_MERGE_ROLE =
  "You find saved memories of one user that hold the same information and merge them into one memory.";

// marks the plan groups this judge decided (aiJudge). A later scan reuses
// only these verdicts; older pair-judge groups have no marker.
export const CLUSTER_MERGE_JUDGE = "cluster_merge";

export interface ClusterMergeMember<M extends string> {
  id: M;
  title: string;
  // may be cut to CLUSTER_MERGE_CONTENT_CHARS; contentLength is the full length
  content: string;
  contentLength: number;
  status: MemoryStatus;
  createdAt: number;
}

export type ClusterMergeVerdict<M extends string> =
  | {
      status: "flagged";
      keeperId: M;
      removeIds: M[];
      // absent when a merged member was too long for the AI to see in full
      merged?: { title: string; content: string };
      reason: string;
      confidence: number;
    }
  | { status: "not_duplicate"; reason: string; confidence: number }
  | { status: "error"; reason: string };

// the prompt names the memories m0, m1, ..., never by their row ids
function keyOf(index: number): string {
  return `m${String(index)}`;
}

export function buildClusterMergePrompt<M extends string>(
  members: readonly ClusterMergeMember<M>[],
): string {
  const memories = members.map((member, i) => ({
    id: keyOf(i),
    title: member.title,
    content: truncateAtWord(member.content, CLUSTER_MERGE_CONTENT_CHARS),
    createdAt: new Date(member.createdAt).toISOString(),
    ...(member.status === "pinned" ? { pinned: true } : {}),
  }));
  return [
    `These ${String(members.length)} memories may be duplicates. Decide which of them hold the same information, and merge those into one memory.`,
    "Rules:",
    "- duplicate: true only when at least two memories hold the same fact, page or record. Memories about different projects, products, repositories, people or time windows are not duplicates, even when their wording is almost the same.",
    "- Leave out every memory that is not a true duplicate: do not put it in removeIds.",
    "- keepId: the id of the memory to keep. Its row stays, so agents and links that point at it still work. Prefer the oldest and most complete memory. Never remove a pinned memory: when a pinned memory is a duplicate, keep it.",
    "- removeIds: the ids of the other duplicates. They are hidden after the merge.",
    "- mergedTitle and mergedContent: the text of the one kept memory after the merge. Combine every unique fact of the kept memory and the removed ones. Do not add facts that are not in them. Drop repeated and near-duplicate wording. Keep the language of the memories.",
    "- confidence: 0 to 1. reason: one short sentence.",
    'Reply as JSON: {"duplicate": true, "keepId": "m0", "removeIds": ["m1"], "mergedTitle": "...", "mergedContent": "...", "confidence": 0.0, "reason": "..."}',
    'When none are duplicates, reply: {"duplicate": false, "confidence": 0.0, "reason": "..."}',
    "",
    JSON.stringify({ memories }, null, 2),
  ].join("\n");
}

const replySchema = z.object({
  duplicate: z.boolean(),
  keepId: z.string().nullish(),
  removeIds: z.array(z.string()).nullish(),
  mergedTitle: z.string().nullish(),
  mergedContent: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  reason: z.string().nullish(),
});

// one sentence without its end stop: proposals add their own sentence after it
function replyReason(
  given: string | null | undefined,
  fallback: string,
): string {
  const reason = (given ?? "").trim().replace(/[.\s]+$/, "");
  return truncateAtWord(reason.length > 0 ? reason : fallback, REASON_CHARS);
}

/**
 * Reads the judge reply. Malformed JSON, a keeper outside the cluster, or a
 * flagged merge with no merged text give "error". Below CLUSTER_MERGE_MIN or
 * with nothing safe to remove it is "not_duplicate". Remove ids outside the
 * cluster are ignored; a pinned row is never removed.
 */
export function parseClusterMergeReply<M extends string>(
  members: readonly ClusterMergeMember<M>[],
  content: string | null,
): ClusterMergeVerdict<M> {
  if (content === null) return { status: "error", reason: "empty reply" };
  const reply = parseJsonString(content, replySchema);
  if (reply === null) return { status: "error", reason: "malformed reply" };
  const confidence = reply.confidence;
  if (!reply.duplicate || confidence < CLUSTER_MERGE_MIN) {
    return {
      status: "not_duplicate",
      reason: replyReason(reply.reason, "Not duplicates"),
      confidence,
    };
  }
  const keeperIndex = members.findIndex((_, i) => keyOf(i) === reply.keepId);
  const keeper = members[keeperIndex];
  if (keeper === undefined) {
    return { status: "error", reason: "keeper not in group" };
  }
  const removeKeys = new Set(reply.removeIds ?? []);
  const removed = members.filter(
    (member, i) =>
      i !== keeperIndex &&
      member.status !== "pinned" &&
      removeKeys.has(keyOf(i)),
  );
  if (removed.length === 0) {
    return {
      status: "not_duplicate",
      reason: "Nothing safe to remove",
      confidence,
    };
  }
  const seenInFull = [keeper, ...removed].every(
    (member) => member.contentLength <= CLUSTER_MERGE_CONTENT_CHARS,
  );
  const title = reply.mergedTitle?.trim() ?? "";
  const mergedContent = reply.mergedContent?.trim() ?? "";
  if (seenInFull && (title.length === 0 || mergedContent.length === 0)) {
    return { status: "error", reason: "no merged text" };
  }
  return {
    status: "flagged",
    keeperId: keeper.id,
    removeIds: removed.map((member) => member.id),
    ...(seenInFull ? { merged: { title, content: mergedContent } } : {}),
    reason: replyReason(reply.reason, "Duplicate"),
    confidence,
  };
}
