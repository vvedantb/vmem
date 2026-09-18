import type { BenchmarkCorpus, BenchmarkMemory } from "../corpus";
import {
  LOCOMO_CATEGORY_TO_TYPE,
  type LocomoIrQuery,
  type LocomoIrSample,
  type LocomoSkippedQuery,
  type LoCoMoItem,
  type LoCoMoTurn,
  type LocomoQuestionType,
} from "./types";

export const LOCOMO_IR_USER_ID = "user_vmem_locomo_ir";
export const LOCOMO_IR_SOURCE = "locomo-ir";

const DIA_ID = /^D\d+:\d+$/;
const GOLD_GRADE = 3;
const MS_PER_DAY = 86_400_000;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function parseLocomoDate(dateStr: string): Date | undefined {
  const match = dateStr.match(
    /(\d+):(\d+)\s*(am|pm)\s*on\s*(\d+)\s*(\w+),?\s*(\d+)/i,
  );
  if (match === null) return undefined;
  const hourStr = match[1];
  const minStr = match[2];
  const ampm = match[3];
  const dayStr = match[4];
  const monthName = match[5];
  const yearStr = match[6];
  if (
    hourStr === undefined ||
    minStr === undefined ||
    ampm === undefined ||
    dayStr === undefined ||
    monthName === undefined ||
    yearStr === undefined
  ) {
    return undefined;
  }
  let hour = Number.parseInt(hourStr, 10);
  if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
  const month = MONTHS.findIndex((name) =>
    name.startsWith(monthName.toLowerCase()),
  );
  if (month < 0) return undefined;
  return new Date(
    Date.UTC(
      Number.parseInt(yearStr, 10),
      month,
      Number.parseInt(dayStr, 10),
      hour,
      Number.parseInt(minStr, 10),
    ),
  );
}

export function locomoQuestionType(
  category: number,
): LocomoQuestionType | undefined {
  switch (category) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return LOCOMO_CATEGORY_TO_TYPE[category];
    default:
      return undefined;
  }
}

export function normalizeEvidenceIds(raw: readonly string[]): {
  ids: string[];
  dropped: string[];
} {
  const ids: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const piece of raw) {
    const tokens = piece
      .split(/[;,]+|\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (tokens.length === 0) {
      dropped.push(piece);
      continue;
    }
    for (const token of tokens) {
      if (!DIA_ID.test(token)) {
        dropped.push(token);
        continue;
      }
      if (seen.has(token)) continue;
      seen.add(token);
      ids.push(token);
    }
  }
  return { ids, dropped };
}

function isTurn(value: unknown): value is LoCoMoTurn {
  if (value === null || typeof value !== "object") return false;
  if (!("speaker" in value) || !("dia_id" in value) || !("text" in value)) {
    return false;
  }
  if (
    typeof value.speaker !== "string" ||
    typeof value.dia_id !== "string" ||
    typeof value.text !== "string"
  ) {
    return false;
  }
  return true;
}

function sessionTurns(value: unknown): LoCoMoTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTurn);
}

function memoryTitle(sampleId: string, diaId: string): string {
  return `${sampleId}/${diaId}`;
}

function memoryId(sampleId: string, diaId: string): string {
  return `locomo_${sampleId}_${diaId.replaceAll(":", "_")}`;
}

function turnContent(
  turn: LoCoMoTurn,
  sessionDate: string | undefined,
): string {
  const when = sessionDate === undefined ? "" : ` (${sessionDate})`;
  const caption =
    turn.blip_caption === undefined || turn.blip_caption.length === 0
      ? ""
      : `\nImage: ${turn.blip_caption}`;
  return `${turn.speaker}${when}: ${turn.text}${caption}`;
}

export function convertLocomoSample(item: LoCoMoItem): LocomoIrSample {
  const conv = item.conversation;
  const memories: BenchmarkMemory[] = [];
  const diaToTitle = new Map<string, string>();
  const skipped: LocomoSkippedQuery[] = [];
  let lastMs = 0;

  for (let sessionIndex = 1; sessionIndex <= 200; sessionIndex += 1) {
    const sessionKey = `session_${String(sessionIndex)}`;
    const turns = sessionTurns(conv[sessionKey]);
    if (turns.length === 0) {
      if (conv[sessionKey] === undefined) break;
      continue;
    }
    const dateKey = `session_${String(sessionIndex)}_date_time`;
    const rawDate = conv[dateKey];
    const dateStr = typeof rawDate === "string" ? rawDate : undefined;
    const parsed = dateStr === undefined ? undefined : parseLocomoDate(dateStr);
    const createdAt =
      parsed?.toISOString() ??
      new Date(Date.UTC(2023, 0, sessionIndex)).toISOString();
    const createdMs = Date.parse(createdAt);
    if (Number.isFinite(createdMs) && createdMs > lastMs) lastMs = createdMs;

    for (const turn of turns) {
      const title = memoryTitle(item.sample_id, turn.dia_id);
      if (diaToTitle.has(turn.dia_id)) {
        throw new Error(`duplicate dia_id ${turn.dia_id} in ${item.sample_id}`);
      }
      diaToTitle.set(turn.dia_id, title);
      memories.push({
        id: memoryId(item.sample_id, turn.dia_id),
        userId: `${LOCOMO_IR_USER_ID}_${item.sample_id}`,
        title,
        content: turnContent(turn, dateStr),
        type: "episodic",
        source: LOCOMO_IR_SOURCE,
        confidence: 0.85,
        status: "active",
        tags: [`session-${String(sessionIndex)}`, turn.speaker.toLowerCase()],
        createdAt,
        updatedAt: createdAt,
        expiresAt: null,
        eventStart: createdAt,
        temporalKind: "event",
      });
    }
  }

  const queries: LocomoIrQuery[] = [];
  for (const qa of item.qa) {
    const type = locomoQuestionType(qa.category);
    const evidence = qa.evidence ?? [];
    if (type === undefined) {
      skipped.push({
        sampleId: item.sample_id,
        question: qa.question,
        category: qa.category,
        reason: "unknown-category",
        evidence,
      });
      continue;
    }
    const { ids } = normalizeEvidenceIds(evidence);
    if (ids.length === 0) {
      skipped.push({
        sampleId: item.sample_id,
        question: qa.question,
        category: qa.category,
        reason: "empty-evidence",
        evidence,
      });
      continue;
    }
    const titles: string[] = [];
    let unresolved = false;
    for (const diaId of ids) {
      const title = diaToTitle.get(diaId);
      if (title === undefined) {
        unresolved = true;
        break;
      }
      titles.push(title);
    }
    if (unresolved) {
      skipped.push({
        sampleId: item.sample_id,
        question: qa.question,
        category: qa.category,
        reason: "unresolved-evidence",
        evidence,
      });
      continue;
    }
    const relevance: Record<string, number> = {};
    for (const title of titles) relevance[title] = GOLD_GRADE;
    queries.push({
      query: qa.question,
      expectedTitles: titles,
      relevance,
      type,
      sampleId: item.sample_id,
      evidenceIds: ids,
      category: qa.category,
      groundTruth: qa.answer === undefined ? "" : String(qa.answer),
      needsSynthesis: type === "multi-hop",
      needsWorldKnowledge: type === "world-knowledge",
      adversarial: type === "adversarial",
    });
  }

  return {
    sampleId: item.sample_id,
    memories,
    queries,
    skipped,
    nowMs: lastMs + MS_PER_DAY,
  };
}

export function convertLocomoDataset(items: readonly LoCoMoItem[]): {
  samples: LocomoIrSample[];
  skipped: LocomoSkippedQuery[];
} {
  const samples = items.map(convertLocomoSample);
  return {
    samples,
    skipped: samples.flatMap((sample) => sample.skipped),
  };
}

export function sliceLocomoSamples(
  samples: readonly LocomoIrSample[],
  limit: number | undefined,
): LocomoIrSample[] {
  if (limit === undefined) {
    return samples.map((sample) => ({
      ...sample,
      queries: [...sample.queries],
      skipped: [...sample.skipped],
      memories: [...sample.memories],
    }));
  }
  let remaining = limit;
  const out: LocomoIrSample[] = [];
  for (const sample of samples) {
    if (remaining <= 0) break;
    const queries = sample.queries.slice(0, remaining);
    remaining -= queries.length;
    if (queries.length === 0) continue;
    out.push({
      ...sample,
      queries,
      memories: [...sample.memories],
      skipped: [...sample.skipped],
    });
  }
  return out;
}

export function sampleToCorpus(sample: LocomoIrSample): BenchmarkCorpus {
  return {
    memories: sample.memories,
    relationships: [],
    queries: sample.queries,
  };
}
