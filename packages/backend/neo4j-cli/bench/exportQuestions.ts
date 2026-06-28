/**
 * Export LoCoMo QA pairs for Claude Code bench scripts (stdout JSON).
 *
 * Usage:
 *   pnpm bench:export-questions -- --conversations 1 --max-questions 10
 */

import { loadLocomo, ADVERSARIAL_CATEGORY } from "./datasets/locomo";

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const conversationsRaw = arg("--conversations");
const maxQuestionsRaw = arg("--max-questions");
const conversationId = arg("--conversation-id");

const conversations = loadLocomo();
const selected =
  conversationId !== undefined
    ? conversations.filter((c) => c.id === conversationId)
    : conversationsRaw
      ? conversations.slice(0, Math.max(0, Number(conversationsRaw)))
      : conversations;

const maxQuestions =
  maxQuestionsRaw === undefined ? null : Math.max(0, Number(maxQuestionsRaw));

const out = selected.flatMap((conversation) => {
  const qa =
    maxQuestions === null
      ? conversation.qa
      : conversation.qa.slice(0, maxQuestions);
  return qa
    .filter((item) => item.category !== ADVERSARIAL_CATEGORY)
    .map((item) => ({
      conversationId: conversation.id,
      qaIndex: item.index,
      category: item.category,
      categoryLabel: item.categoryLabel,
      question: item.question,
      gold: item.answer,
    }));
});

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
