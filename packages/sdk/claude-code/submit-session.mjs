#!/usr/bin/env node
// Claude Code SessionEnd hook: send the finished session transcript to vmem
// (POST /api/v1/transcripts) so Nightly Dream can distill it.
// Plain Node, no packages. It never fails the session: every error is logged
// in one line and the exit code is always 0.
// Env: VMEM_API_KEY (vmem_sk_…), VMEM_BASE_URL (https://<deployment>.convex.site).

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSubmitted, recordSubmitted, skipReason } from "./dedupe.mjs";
import { redactSecrets } from "./redact.mjs";
import { parseJsonl, renderTranscript } from "./render.mjs";
import { hookPayloadSchema } from "./schemas.mjs";
import { truncateToBytes } from "./truncate.mjs";

const TIMEOUT_MS = 8000;
const CLAUDE_DIR = join(homedir(), ".claude");
export const STATE_PATH = join(CLAUDE_DIR, "vmem-transcript-submitted.json");
const LOG_PATH = join(CLAUDE_DIR, "vmem-transcript-hook.log");

/**
 * Title shown in vmem, e.g. "Claude Code · vmem · 1a2b3c4d".
 * @param {string} cwd
 * @param {string} sessionId
 * @returns {string}
 */
export function sessionTitle(cwd, sessionId) {
  const project = cwd ? basename(cwd) : "";
  return ["Claude Code", project, sessionId.slice(0, 8)]
    .filter((part) => part !== "")
    .join(" · ");
}

/**
 * Run the hook for one SessionEnd payload. Returns the one-line outcome.
 * @param {{
 *   payload: string;
 *   env: Record<string, string | undefined>;
 *   statePath?: string;
 *   fetchImpl?: typeof fetch;
 * }} input
 * @returns {Promise<string>}
 */
export async function submitSession({
  payload,
  env,
  statePath = STATE_PATH,
  fetchImpl = fetch,
}) {
  const apiKey = env.VMEM_API_KEY?.trim();
  const baseUrl = env.VMEM_BASE_URL?.trim().replace(/\/+$/u, "");
  if (!apiKey || !baseUrl) return "skipped: set VMEM_API_KEY and VMEM_BASE_URL";

  const { sessionId, transcriptPath, cwd } = hookPayloadSchema.parse(
    JSON.parse(payload),
  );
  if (!sessionId || !transcriptPath) {
    return "skipped: payload has no session_id or transcript_path";
  }

  const rendered = renderTranscript(
    parseJsonl(await readFile(transcriptPath, "utf8")),
  );
  const reason = skipReason({
    sessionId,
    userTurns: rendered.userTurns,
    submitted: await readSubmitted(statePath),
  });
  if (reason) return `skipped ${sessionId}: ${reason}`;

  const transcript = truncateToBytes(redactSecrets(rendered.text));
  const response = await fetchImpl(`${baseUrl}/api/v1/transcripts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transcript, title: sessionTitle(cwd, sessionId) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    return `failed ${sessionId}: HTTP ${response.status} ${detail}`.trim();
  }
  await recordSubmitted(statePath, sessionId);
  return `submitted ${sessionId} (${Buffer.byteLength(transcript, "utf8")} bytes)`;
}

/** @returns {Promise<string>} */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** @param {string} line */
async function log(line) {
  const stamped = `${new Date().toISOString()} vmem-transcript-hook: ${line.replace(/\s+/gu, " ")}`;
  process.stderr.write(`${stamped}\n`);
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, `${stamped}\n`);
  } catch {}
}

async function main() {
  try {
    await log(
      await submitSession({ payload: await readStdin(), env: process.env }),
    );
  } catch (error) {
    await log(
      `error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exitCode = 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
