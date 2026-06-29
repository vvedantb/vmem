/**
 * Benchmark loader dispatcher for the engine harness (`run.ts`).
 *
 * Maps LoCoMo, LongMemEval-S, and BEAM into ONE shape — `LocomoConversation[]` —
 * so the whole downstream pipeline (providers, retrieval, answer, judge,
 * journal, metrics, report) stays benchmark-agnostic. Each "conversation" is one
 * isolation unit: a LoCoMo/BEAM conversation, or a single LongMemEval question
 * with its own haystack (so per-unit synthetic-user isolation gives faithful
 * per-question retrieval).
 *
 * - LoCoMo → pass-through (native 1–4 category codes).
 * - LongMemEval → 1 item = 1 conversation (1 question). `question_type` → a
 *   stable synthetic category number; `isAbstention` from the loader.
 * - BEAM → 1 conversation = 1 conversation. Sessions are sub-chunked to
 *   `chunkTokens` so each extraction prompt stays bounded; `question_type` →
 *   category number; abstention from the ability. (Rubric abilities already
 *   dropped by the BEAM loader.)
 *
 * `stratifiedSample` (seeded, proportional across `categoryLabel`) selects a
 * representative slice — intended for LongMemEval, where each unit is one
 * question of one type.
 */

import {
  loadLocomo,
  type LocomoConversation,
  type LocomoQa,
  type LocomoSession,
  type LocomoTurn,
} from "./datasets/locomo";
import {
  loadLongMemEval,
  type LongMemEvalItem,
  type LongMemEvalSession,
} from "./datasets/longmemeval";
import {
  loadBeam,
  type BeamConversation,
  type BeamSession,
} from "./datasets/beam";
import { approxTokens } from "./providers/types";

export type BenchmarkName = "locomo" | "longmemeval" | "beam";

export function isBenchmarkName(value: string): value is BenchmarkName {
  return value === "locomo" || value === "longmemeval" || value === "beam";
}

export interface LoadBenchmarkOptions {
  beamSplit: string;
  chunkTokens: number;
}

/**
 * Assigns each distinct question_type a stable category number. LoCoMo keeps its
 * native 1–4 codes; synthetic numbers start at 100 to avoid collision and sort
 * after the native ones in the report.
 */
class CategoryRegistry {
  private readonly map = new Map<string, number>();
  private next = 100;
  numberFor(label: string): number {
    const existing = this.map.get(label);
    if (existing !== undefined) return existing;
    const assigned = this.next;
    this.next += 1;
    this.map.set(label, assigned);
    return assigned;
  }
}

function toLocomoTurn(role: string, content: string): LocomoTurn {
  return { speaker: role, diaId: "", text: content };
}

// ---- LongMemEval ----

function mapLongMemEvalSession(
  session: LongMemEvalSession,
  index: number,
): LocomoSession {
  return {
    key: session.sessionId || `session_${String(index + 1)}`,
    index: index + 1,
    dateTime: session.date,
    turns: session.turns.map((t) => toLocomoTurn(t.role, t.content)),
  };
}

function mapLongMemEvalItem(
  item: LongMemEvalItem,
  registry: CategoryRegistry,
): LocomoConversation {
  const sessions = item.sessions.map(mapLongMemEvalSession);
  const qa: LocomoQa = {
    index: 0,
    question: item.question,
    answer: item.answer,
    evidence: [],
    category: registry.numberFor(item.questionType),
    categoryLabel: item.questionType,
    isAbstention: item.isAbstention,
  };
  return {
    id: item.id,
    speakerA: "user",
    speakerB: "assistant",
    sessions,
    qa: [qa],
    latestDateTime: sessions.at(-1)?.dateTime ?? item.questionDate,
  };
}

// ---- BEAM ----

/** Split a BEAM session's turns into ≤maxTokens windows so extraction stays bounded. */
function chunkBeamSession(
  session: BeamSession,
  maxTokens: number,
  sessionIndex: number,
): LocomoSession[] {
  const out: LocomoSession[] = [];
  let windowTurns: LocomoTurn[] = [];
  let windowTokens = 0;
  let part = 0;
  const flush = (): void => {
    if (windowTurns.length === 0) return;
    part += 1;
    out.push({
      key: `${session.sessionId}_p${String(part)}`,
      index: sessionIndex * 1000 + part,
      dateTime: session.dateTime,
      turns: windowTurns,
    });
    windowTurns = [];
    windowTokens = 0;
  };
  for (const turn of session.turns) {
    const tokens = approxTokens(turn.content);
    if (windowTokens + tokens > maxTokens && windowTurns.length > 0) flush();
    windowTurns.push(toLocomoTurn(turn.role, turn.content));
    windowTokens += tokens;
  }
  flush();
  return out;
}

function mapBeamConversation(
  conv: BeamConversation,
  registry: CategoryRegistry,
  chunkTokens: number,
): LocomoConversation {
  const sessions = conv.sessions.flatMap((session, index) =>
    chunkBeamSession(session, chunkTokens, index),
  );
  const qa: LocomoQa[] = conv.questions.map((q, index) => ({
    index,
    question: q.question,
    answer: q.answer,
    evidence: [],
    category: registry.numberFor(q.questionType),
    categoryLabel: q.questionType,
    isAbstention: q.isAbstention,
  }));
  return {
    id: conv.id,
    speakerA: "user",
    speakerB: "assistant",
    sessions,
    qa,
    latestDateTime: sessions.at(-1)?.dateTime ?? "",
  };
}

// ---- Dispatcher ----

export function loadBenchmark(
  name: BenchmarkName,
  options: LoadBenchmarkOptions,
): LocomoConversation[] {
  if (name === "locomo") return loadLocomo();
  const registry = new CategoryRegistry();
  if (name === "longmemeval") {
    return loadLongMemEval().map((item) => mapLongMemEvalItem(item, registry));
  }
  return loadBeam(options.beamSplit).conversations.map((conv) =>
    mapBeamConversation(conv, registry, options.chunkTokens),
  );
}

// ---- Stratified sampling (seeded, deterministic) ----

/** mulberry32 — deterministic PRNG so a given seed reproduces the same slice. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Deterministic stratified sample of `n` conversations, proportional across the
 * first question's `categoryLabel`. Intended for LongMemEval (1 question/unit);
 * returns all conversations when `n >= total` or `n <= 0`.
 */
export function stratifiedSample(
  conversations: LocomoConversation[],
  n: number,
  seed: number,
): LocomoConversation[] {
  if (n >= conversations.length || n <= 0) return conversations;

  const buckets = new Map<string, LocomoConversation[]>();
  for (const conv of conversations) {
    const label = conv.qa[0]?.categoryLabel ?? "unknown";
    const bucket = buckets.get(label) ?? [];
    bucket.push(conv);
    buckets.set(label, bucket);
  }

  const total = conversations.length;
  const rand = mulberry32(seed);
  const allocations = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, convs]) => {
      const ideal = (n * convs.length) / total;
      return {
        convs: seededShuffle(convs, rand),
        take: Math.floor(ideal),
        frac: ideal - Math.floor(ideal),
      };
    });

  let used = allocations.reduce((sum, a) => sum + a.take, 0);
  const byFraction = [...allocations].sort((a, b) => b.frac - a.frac);
  for (let i = 0; used < n && i < byFraction.length * 1000; i++) {
    const target = byFraction[i % byFraction.length];
    if (target && target.take < target.convs.length) {
      target.take += 1;
      used += 1;
    }
  }

  return allocations.flatMap((a) => a.convs.slice(0, a.take));
}
