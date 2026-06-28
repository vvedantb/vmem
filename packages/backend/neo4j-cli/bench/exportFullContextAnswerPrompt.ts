/**
 * Build a full-context (oracle transcript) answer prompt for Claude bench (stdout).
 *
 * Usage:
 *   pnpm exec tsx neo4j-cli/bench/exportFullContextAnswerPrompt.ts -- \
 *     --conversation-id conv-26 --max-sessions 19 --question "When did ..."
 */

import { readFileSync } from "node:fs";
import { loadLocomo } from "./datasets/locomo";
import { buildAnswerPrompt } from "./qa/answerPrompt";
import { renderSessionTranscript } from "./providers/vmemExtractPrompt";

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const conversationId = arg("--conversation-id");
const maxSessionsRaw = arg("--max-sessions");
const questionArg = arg("--question");
const filePath = arg("--file");

let conversationIdResolved: string;
let maxSessions: number | null;
let question: string;

if (filePath) {
  const payload = JSON.parse(readFileSync(filePath, "utf8")) as {
    conversationId: string;
    question: string;
    maxSessions?: number;
  };
  conversationIdResolved = payload.conversationId;
  question = payload.question;
  maxSessions =
    payload.maxSessions === undefined
      ? null
      : Math.max(0, Number(payload.maxSessions));
} else if (conversationId && questionArg) {
  conversationIdResolved = conversationId;
  question = questionArg;
  maxSessions =
    maxSessionsRaw === undefined ? null : Math.max(0, Number(maxSessionsRaw));
} else {
  console.error(
    "usage: exportFullContextAnswerPrompt.ts --conversation-id ID --question TEXT [--max-sessions N]\n" +
      "   or: exportFullContextAnswerPrompt.ts --file payload.json",
  );
  process.exit(1);
}

const conversation = loadLocomo().find((c) => c.id === conversationIdResolved);
if (!conversation) {
  console.error(`conversation not found: ${conversationIdResolved}`);
  process.exit(1);
}

const sessions =
  maxSessions === null
    ? conversation.sessions
    : conversation.sessions.slice(0, maxSessions);

const transcript = sessions
  .map(
    (session) =>
      `## ${session.key} (${session.dateTime || "no date"})\n${renderSessionTranscript(session.turns)}`,
  )
  .join("\n\n");

const prompt = buildAnswerPrompt(
  question,
  transcript.length > 0 ? [{ id: "full-context", text: transcript }] : [],
  conversation.latestDateTime,
);

process.stdout.write(prompt);
