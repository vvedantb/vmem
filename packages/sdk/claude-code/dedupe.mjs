// Skip rules for the SessionEnd hook: too few user turns, or a session that
// was already sent. The sent session ids live in a small JSON file.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { submittedStateSchema } from "./schemas.mjs";

/** A session with fewer user turns than this is not sent. */
export const MIN_USER_TURNS = 3;
/** Max session ids kept in the state file (oldest dropped first). */
export const MAX_SUBMITTED_IDS = 500;

/**
 * Why the session is skipped, or null to send it. Pure.
 * @param {{ sessionId: string; userTurns: number; submitted: readonly string[] }} input
 * @returns {string | null}
 */
export function skipReason({ sessionId, userTurns, submitted }) {
  if (userTurns < MIN_USER_TURNS) {
    return `only ${userTurns} user turn(s), need ${MIN_USER_TURNS}`;
  }
  if (submitted.includes(sessionId)) return "session already submitted";
  return null;
}

/**
 * `submitted` plus `sessionId`, newest last, capped at `max`. Pure.
 * @param {readonly string[]} submitted
 * @param {string} sessionId
 * @param {number} [max]
 * @returns {string[]}
 */
export function withSubmitted(submitted, sessionId, max = MAX_SUBMITTED_IDS) {
  const next = submitted.filter((id) => id !== sessionId);
  next.push(sessionId);
  return next.slice(-max);
}

/**
 * Session ids in the state file; empty when it is missing or invalid.
 * @param {string} path
 * @returns {Promise<string[]>}
 */
export async function readSubmitted(path) {
  try {
    return submittedStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return [];
  }
}

/**
 * Add `sessionId` to the state file.
 * @param {string} path
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function recordSubmitted(path, sessionId) {
  const sessionIds = withSubmitted(await readSubmitted(path), sessionId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ sessionIds }, null, 2)}\n`);
}
