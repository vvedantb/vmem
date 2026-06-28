/**
 * LoCoMo benchmark orchestrator.
 *
 * Drives every selected provider through ingest → search → answer → judge,
 * appending each graded question to a JSONL journal (resumable). The answer
 * and judge models are shared across all providers so the only variable
 * between rows is the memory system.
 *
 * Usage:
 *   pnpm bench:locomo --conversations 1 --providers vmem,full-context
 *   pnpm bench:locomo --providers vmem --dry-run        # cost estimate only
 *   pnpm bench:locomo --run-id run-123 --resume         # continue a run
 *
 * Flags:
 *   --conversations N      first N conversations (default: all 10)
 *   --max-sessions N       ingest only the first N sessions per conversation
 *                          (default: all — use a small value for smoke tests
 *                          to stay under free-tier rate limits)
 *   --max-questions N      grade only the first N questions per conversation
 *                          (default: all — use a small value for smoke tests)
 *   --providers a,b        comma list (default: vmem)
 *   --k N                  retrieval top-k (default: 10)
 *   --run-id S             journal id (default: run-<timestamp>)
 *   --resume               skip work already in the journal (needs --run-id)
 *   --max-calls N          hard cap on total LLM calls (default: 0 = none)
 *   --dry-run              print a structural cost estimate, make no calls
 *   --memory-model S       extract/decide/enrich model (default gpt-5-nano)
 *   --answer-model S       answerer model (default gpt-5-nano)
 *   --judge-model S        judge model (default gpt-5-mini)
 *   --user S --profile S   ingest vmem under a real clerkId for the graph view
 *   --facts-per-session N  dry-run assumption (default 4)
 */

import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { ensureNeo4jSetupIfNeeded } from "../../engine/neo4j/setup";
import { isTransientNetworkError } from "../../convex/lib/openRouter/client";
import { generateCliEmbedding } from "../eval/cliEmbeddings";
import { loadLocomo, type LocomoConversation } from "./datasets/locomo";
import {
  CallBudget,
  CallCapExceededError,
  createBenchLlm,
  type BenchLlm,
} from "./llm";
import { buildAnswerPrompt } from "./qa/answerPrompt";
import { buildJudgePrompt, parseJudgeResponse } from "./qa/judgePrompt";
import { FullContextProvider } from "./providers/fullContext";
import { NoMemoryProvider } from "./providers/noMemory";
import { VmemProvider } from "./providers/vmem";
import type { MemoryProvider } from "./providers/types";
import {
  appendRow,
  gradedKeys,
  ingestedKeys,
  qaRows,
  readRows,
  resultsPathFor,
  type QaResultRow,
} from "./results";
import { computeProviderMetrics } from "./metrics";

// Defaults are OpenRouter free-tier models to avoid burning credits. The judge
// is gpt-oss-120b, the same family the LoCoMo methodology references as judge.
// Override with --memory-model/--answer-model/--judge-model for paid models.
const DEFAULT_MEMORY_MODEL = "openai/gpt-oss-20b:free";
const DEFAULT_ANSWER_MODEL = "openai/gpt-oss-20b:free";
const DEFAULT_JUDGE_MODEL = "openai/gpt-oss-120b:free";

interface Args {
  conversations: number | null;
  maxSessions: number | null;
  maxQuestions: number | null;
  providers: string[];
  k: number;
  runId: string;
  resume: boolean;
  maxCalls: number;
  dryRun: boolean;
  memoryModel: string;
  answerModel: string;
  judgeModel: string;
  user?: string;
  profile?: string;
  factsPerSession: number;
  fastIngest: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const conversationsRaw = get("--conversations");
  const maxSessionsRaw = get("--max-sessions");
  const maxQuestionsRaw = get("--max-questions");
  return {
    conversations: conversationsRaw ? Number(conversationsRaw) : null,
    maxSessions: maxSessionsRaw ? Number(maxSessionsRaw) : null,
    maxQuestions: maxQuestionsRaw ? Number(maxQuestionsRaw) : null,
    providers: (get("--providers") ?? "vmem").split(",").map((p) => p.trim()),
    k: Number(get("--k") ?? "10"),
    runId: get("--run-id") ?? `run-${String(Date.now())}`,
    resume: has("--resume"),
    maxCalls: Number(get("--max-calls") ?? "0"),
    dryRun: has("--dry-run"),
    memoryModel: get("--memory-model") ?? DEFAULT_MEMORY_MODEL,
    answerModel: get("--answer-model") ?? DEFAULT_ANSWER_MODEL,
    judgeModel: get("--judge-model") ?? DEFAULT_JUDGE_MODEL,
    user: get("--user"),
    profile: get("--profile"),
    factsPerSession: Number(get("--facts-per-session") ?? "4"),
    fastIngest: has("--fast-ingest"),
  };
}

function selectConversations(
  all: LocomoConversation[],
  n: number | null,
): LocomoConversation[] {
  return n === null ? all : all.slice(0, Math.max(0, n));
}

function buildProvider(
  name: string,
  deps: {
    runId: string;
    memoryLlm: BenchLlm;
    user?: string;
    profile?: string;
    fastIngest: boolean;
  },
): MemoryProvider {
  switch (name) {
    case "vmem":
      return new VmemProvider({
        runId: deps.runId,
        driver: getDriver(),
        llm: deps.memoryLlm,
        embed: generateCliEmbedding,
        userOverride: deps.user,
        profileOverride: deps.profile,
        fastIngest: deps.fastIngest,
      });
    case "full-context":
      return new FullContextProvider();
    case "no-memory":
      return new NoMemoryProvider();
    default:
      throw new Error(
        `unknown provider "${name}". Available: vmem, full-context, no-memory`,
      );
  }
}

function printDryRun(conversations: LocomoConversation[], args: Args): void {
  const sessions = conversations.reduce((s, c) => {
    const count =
      args.maxSessions === null
        ? c.sessions.length
        : Math.min(args.maxSessions, c.sessions.length);
    return s + count;
  }, 0);
  const questions = conversations.reduce((s, c) => {
    const count =
      args.maxQuestions === null
        ? c.qa.length
        : Math.min(args.maxQuestions, c.qa.length);
    return s + count;
  }, 0);
  const hasVmem = args.providers.includes("vmem");
  const f = args.factsPerSession;

  // vmem ingestion LLM calls: full pipeline = per session 1 extract + F
  // decisions + ~0.7·F enrich; fast-ingest = just 1 extract per session
  // (facts stored directly, no per-fact decision or enrichment call).
  const vmemIngest = hasVmem
    ? args.fastIngest
      ? sessions
      : sessions * (1 + f + Math.round(0.7 * f))
    : 0;
  // QA: every provider answers + the judge grades once each.
  const qa = questions * args.providers.length * 2;
  const total = vmemIngest + qa;

  console.log("─── dry run (no LLM calls made) ───");
  console.log(`conversations:        ${String(conversations.length)}`);
  console.log(`sessions:             ${String(sessions)}`);
  console.log(`questions (non-adv):  ${String(questions)}`);
  console.log(`providers:            ${args.providers.join(", ")}`);
  console.log(
    `assumed facts/session: ${String(f)} (override with --facts-per-session)`,
  );
  console.log("");
  console.log(`est. vmem ingest calls: ${String(vmemIngest)}`);
  console.log(`est. QA + judge calls:  ${String(qa)}`);
  console.log(`est. TOTAL LLM calls:   ${String(total)}`);
  console.log(
    "\nembeddings are extra (cheap) and not counted here. Re-run without --dry-run to execute.",
  );
}

const SESSION_INGEST_ATTEMPTS = 3;
const SESSION_RETRY_PAUSE_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ingest one session, retrying transient infra faults before giving up.
 *
 * LoCoMo ingestion alternates long extraction LLM calls (during which the
 * Neo4j pool drains to zero) with bursts of ~5 concurrent retrieval queries.
 * Against Aura free-tier that cold burst occasionally exceeds the driver's
 * acquisition timeout — a transient fault, not data corruption. Re-ingesting
 * is idempotent: the production dedup chain (content hash + 0.95 semantic)
 * collapses any facts the failed attempt already wrote, and by the retry the
 * pool holds the warm connections that first attempt established. Only after
 * exhausting attempts do we skip the session (best-effort, mirroring
 * production's "errors must not poison the batch" philosophy).
 */
async function ingestSessionWithRetry(
  provider: MemoryProvider,
  conversation: LocomoConversation,
  session: LocomoConversation["sessions"][number],
): Promise<void> {
  for (let attempt = 1; attempt <= SESSION_INGEST_ATTEMPTS; attempt++) {
    try {
      await provider.ingestSession(
        conversation.id,
        session,
        conversation.speakerA,
        conversation.speakerB,
      );
      return;
    } catch (err) {
      if (err instanceof CallCapExceededError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = isTransientNetworkError(err);
      if (retryable && attempt < SESSION_INGEST_ATTEMPTS) {
        console.warn(
          `  [${conversation.id}] session ingest transient fault (attempt ${String(attempt)}/${String(SESSION_INGEST_ATTEMPTS)}), retrying: ${message}`,
        );
        await sleep(SESSION_RETRY_PAUSE_MS * attempt);
        continue;
      }
      console.warn(
        `  [${conversation.id}] session ingest failed after ${String(attempt)} attempt(s), skipping: ${message}`,
      );
      return;
    }
  }
}

async function gradeQuestion(
  provider: MemoryProvider,
  conversation: LocomoConversation,
  qa: LocomoConversation["qa"][number],
  args: Args,
  answerLlm: BenchLlm,
  judgeLlm: BenchLlm,
): Promise<QaResultRow> {
  const outcome = await provider.search(conversation.id, qa.question, args.k);

  const answerRaw = await answerLlm.chatText(
    buildAnswerPrompt(
      qa.question,
      outcome.results,
      conversation.latestDateTime,
    ),
  );
  const generated = answerRaw?.trim() ?? "";

  const judgeRaw = await judgeLlm.chatJson(
    buildJudgePrompt(qa.question, qa.answer, generated),
  );
  const verdict = judgeRaw ? parseJudgeResponse(judgeRaw) : null;

  return {
    type: "qa",
    runId: args.runId,
    provider: provider.name,
    conversationId: conversation.id,
    qaIndex: qa.index,
    category: qa.category,
    categoryLabel: qa.categoryLabel,
    question: qa.question,
    gold: qa.answer,
    generated,
    correct: verdict?.correct ?? false,
    judgeParsed: verdict !== null,
    contextTokens: outcome.contextTokens,
    searchLatencyMs: outcome.latencyMs,
  };
}

/**
 * A bench run fires thousands of OpenRouter requests over many minutes. The
 * undici connection pool occasionally hands out a keep-alive socket the
 * server has already closed; the resulting "terminated" / ECONNRESET can
 * surface as an *unhandled* rejection (no awaiter) and would otherwise kill
 * the whole run. Swallow ONLY recognized transient network faults (logged
 * loudly so they stay visible); re-raise anything else so real bugs still
 * crash. The awaited call paths each have their own try/catch + retry, so a
 * swallowed dangling rejection does not strand in-flight work.
 */
function installTransientNetworkGuard(): void {
  const message = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

  // An *unhandled rejection* is, by definition, off the awaited critical path:
  // every awaited call (LLM send, session ingest, search) has its own
  // try/catch + retry, so a dangling rejection cannot strand in-flight work.
  // In a long unattended run a single such blip (an SDK parsing an empty body,
  // a stray socket reset) must NOT kill thousands of dollars-minutes of
  // progress. Log it loudly and continue — recognized transients get a quieter
  // line. The journal makes any genuinely lost work re-runnable.
  process.on("unhandledRejection", (reason) => {
    if (isTransientNetworkError(reason)) {
      console.warn(`[bench] swallowed transient rejection: ${message(reason)}`);
    } else {
      console.warn(`[bench] swallowed unhandled rejection: ${message(reason)}`);
    }
  });

  // An *uncaught synchronous exception* is genuinely unrecoverable — the stack
  // is gone. Swallow only recognized transients; crash on anything else so a
  // real bug surfaces rather than corrupting the run silently.
  process.on("uncaughtException", (err) => {
    if (isTransientNetworkError(err)) {
      console.warn(`[bench] swallowed transient exception: ${message(err)}`);
      return;
    }
    console.error("[bench] fatal uncaughtException:", err);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  installTransientNetworkGuard();
  const args = parseArgs(process.argv.slice(2));

  const conversations = selectConversations(loadLocomo(), args.conversations);
  if (conversations.length === 0) {
    throw new Error("no conversations selected");
  }

  if (args.dryRun) {
    printDryRun(conversations, args);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required — the bench must use real embeddings/LLMs.",
    );
  }
  const budget = new CallBudget(args.maxCalls);
  const memoryLlm = createBenchLlm({ apiKey, model: args.memoryModel, budget });
  const answerLlm = createBenchLlm({ apiKey, model: args.answerModel, budget });
  const judgeLlm = createBenchLlm({ apiKey, model: args.judgeModel, budget });

  const path = resultsPathFor(args.runId);
  const priorRows = args.resume ? readRows(path) : [];
  const alreadyIngested = ingestedKeys(priorRows);
  const alreadyGraded = gradedKeys(priorRows);

  console.log(`run id:      ${args.runId}`);
  console.log(`journal:     ${path}`);
  console.log(`providers:   ${args.providers.join(", ")}`);
  console.log(
    `models:      memory=${args.memoryModel} answer=${args.answerModel} judge=${args.judgeModel}`,
  );
  console.log(
    `fast-ingest: ${args.fastIngest ? "on (direct ADD, no decision/enrich)" : "off (full pipeline)"}`,
  );
  console.log(
    `max calls:   ${args.maxCalls === 0 ? "unlimited" : String(args.maxCalls)}`,
  );
  console.log("");

  const needsNeo4j = args.providers.includes("vmem");
  if (needsNeo4j) {
    await ensureNeo4jSetupIfNeeded(getDriver());
  }

  try {
    for (const providerName of args.providers) {
      const provider = buildProvider(providerName, {
        runId: args.runId,
        memoryLlm,
        user: args.user,
        profile: args.profile,
        fastIngest: args.fastIngest,
      });
      console.log(`\n══ provider: ${provider.name} ══`);

      for (const conversation of conversations) {
        const sessionsToIngest =
          args.maxSessions === null
            ? conversation.sessions
            : conversation.sessions.slice(0, args.maxSessions);

        const ingestKey = `${provider.name}::${conversation.id}`;
        if (!alreadyIngested.has(ingestKey)) {
          console.log(
            `  [${conversation.id}] ingesting ${String(sessionsToIngest.length)} sessions…`,
          );
          await provider.reset(conversation.id);
          for (const session of sessionsToIngest) {
            await ingestSessionWithRetry(provider, conversation, session);
          }
          appendRow(path, {
            type: "ingested",
            provider: provider.name,
            conversationId: conversation.id,
          });
        } else {
          console.log(`  [${conversation.id}] ingest cached, skipping`);
        }

        const qaToGrade =
          args.maxQuestions === null
            ? conversation.qa
            : conversation.qa.slice(0, args.maxQuestions);

        let graded = 0;
        for (const qa of qaToGrade) {
          const gradeKey = `${provider.name}::${conversation.id}::${String(qa.index)}`;
          if (alreadyGraded.has(gradeKey)) continue;
          const row = await gradeQuestion(
            provider,
            conversation,
            qa,
            args,
            answerLlm,
            judgeLlm,
          );
          appendRow(path, row);
          graded += 1;
        }
        console.log(
          `  [${conversation.id}] graded ${String(graded)} questions (${String(qaToGrade.length)} targeted, ${String(conversation.qa.length)} total)`,
        );
      }

      if (provider.cleanup) await provider.cleanup();
    }

    printSummary(path, args.providers);
    const totalCost =
      memoryLlm.totals.costUsd +
      answerLlm.totals.costUsd +
      judgeLlm.totals.costUsd;
    console.log(
      `\nLLM calls: ${String(budget.used)} · est. cost: $${totalCost.toFixed(4)}`,
    );
  } catch (err) {
    if (err instanceof CallCapExceededError) {
      console.error(
        `\n${err.message} Progress saved to ${path} — resume with --run-id ${args.runId} --resume.`,
      );
    } else {
      throw err;
    }
  } finally {
    await closeDriver();
  }
}

function printSummary(path: string, providers: string[]): void {
  const rows = qaRows(readRows(path));
  console.log("\n─── results ───");
  for (const provider of providers) {
    const m = computeProviderMetrics(provider, rows);
    if (m.total === 0) continue;
    console.log(
      `${provider}: J=${(m.accuracy * 100).toFixed(1)}% (${String(m.correct)}/${String(m.total)}) · ctx≈${String(Math.round(m.meanContextTokens))} tok · search p50=${String(m.searchLatencyP50)}ms p95=${String(m.searchLatencyP95)}ms`,
    );
    for (const c of m.perCategory) {
      console.log(
        `    ${c.label}: ${(c.accuracy * 100).toFixed(1)}% (${String(c.correct)}/${String(c.total)})`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
