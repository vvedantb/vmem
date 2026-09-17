import type { MemoryType, MemoryWithTags, TemporalKind } from "@vmem/sdk";

const MS_PER_DAY = 86_400_000;

export interface TemporalFields {
  eventStart: string | null;
  eventEnd: string | null;
  temporalKind: TemporalKind | null;
}

export type QueryTemporalIntent =
  | { kind: "none" }
  | { kind: "current" }
  | { kind: "plan" }
  | { kind: "preference" }
  | { kind: "window"; startMs: number; endMs: number; label: string };

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const MONTH_PATTERN = Object.keys(MONTH_INDEX).join("|");

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function parseMillis(
  value: string | null | undefined,
): number | undefined {
  if (value === undefined || value === null || value.trim().length === 0) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function parseReferenceMs(
  value: string | undefined,
  fallbackMs: number,
): number {
  const parsed = parseMillis(value);
  return parsed ?? fallbackMs;
}

function utcDay(ms: number): { y: number; m: number; d: number } {
  const date = new Date(ms);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    d: date.getUTCDate(),
  };
}

function utcDayStart(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day);
}

function dayWindow(
  year: number,
  month: number,
  day: number,
): {
  startMs: number;
  endMs: number;
} {
  const startMs = utcDayStart(year, month, day);
  return { startMs, endMs: startMs + MS_PER_DAY };
}

function rollingWindow(
  nowMs: number,
  fromDaysAgo: number,
  toDaysAgo: number,
  label: string,
): QueryTemporalIntent {
  return {
    kind: "window",
    startMs: nowMs - fromDaysAgo * MS_PER_DAY,
    endMs: nowMs - toDaysAgo * MS_PER_DAY,
    label,
  };
}

interface ParsedDateSpan {
  startMs: number;
  endMs: number;
}

function parseDatesInText(text: string, nowMs: number): ParsedDateSpan[] {
  const out: ParsedDateSpan[] = [];
  const { y: refYear } = utcDay(nowMs);

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  for (const match of text.matchAll(iso)) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    if (
      !Number.isFinite(year) ||
      month < 0 ||
      month > 11 ||
      day < 1 ||
      day > 31
    ) {
      continue;
    }
    out.push(dayWindow(year, month, day));
  }

  const named = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`,
    "gi",
  );
  for (const match of text.matchAll(named)) {
    const day = Number(match[1]);
    const month = MONTH_INDEX[match[2]?.toLowerCase() ?? ""];
    const year = match[3] !== undefined ? Number(match[3]) : refYear;
    if (month === undefined || day < 1 || day > 31) continue;
    out.push(dayWindow(year, month, day));
  }

  const monthFirst = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*|\\s+)(\\d{4})\\b`,
    "gi",
  );
  for (const match of text.matchAll(monthFirst)) {
    const month = MONTH_INDEX[match[1]?.toLowerCase() ?? ""];
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month === undefined || day < 1 || day > 31) continue;
    out.push(dayWindow(year, month, day));
  }

  const yearOnly = /\bin\s+(\d{4})\b/gi;
  for (const match of text.matchAll(yearOnly)) {
    const year = Number(match[1]);
    if (!Number.isFinite(year)) continue;
    out.push({
      startMs: Date.UTC(year, 0, 1),
      endMs: Date.UTC(year + 1, 0, 1),
    });
  }

  return out;
}

export function classifyQueryTemporal(
  query: string,
  nowMs: number,
): QueryTemporalIntent {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { kind: "none" };

  const dates = parseDatesInText(query, nowMs);
  if (dates.length > 0) {
    return {
      kind: "window",
      startMs: Math.min(...dates.map((span) => span.startMs)),
      endMs: Math.max(...dates.map((span) => span.endMs)),
      label: "date",
    };
  }

  if (/\byesterday\b|\blast night\b/.test(q)) {
    return rollingWindow(nowMs, 2, 1, "yesterday");
  }
  if (/\blast week\b|\bpast week\b/.test(q)) {
    return rollingWindow(nowMs, 14, 7, "last week");
  }
  if (/\bthis week\b/.test(q)) {
    return rollingWindow(nowMs, 7, 0, "this week");
  }
  if (/\blast month\b/.test(q)) {
    return rollingWindow(nowMs, 60, 30, "last month");
  }
  if (/\b(today|tonight)\b/.test(q)) {
    return rollingWindow(nowMs, 1, 0, "today");
  }
  if (
    /\b(next week|upcoming|coming up|soon|going to|will|plan to|planning to|scheduled)\b/.test(
      q,
    )
  ) {
    return { kind: "plan" };
  }
  if (/\b(current|currently|now|latest|as of|these days)\b/.test(q)) {
    return { kind: "current" };
  }
  if (
    /\b(prefer|prefers|preferred|preference|always|usually|favorite|favourite)\b/.test(
      q,
    )
  ) {
    return { kind: "preference" };
  }
  return { kind: "none" };
}

export function hasTemporalIntent(intent: QueryTemporalIntent): boolean {
  return (
    intent.kind === "current" ||
    intent.kind === "window" ||
    intent.kind === "plan"
  );
}

function inferKind(
  text: string,
  type: MemoryType | undefined,
  hasDate: boolean,
): TemporalKind | null {
  const lower = text.toLowerCase();
  if (
    /\b(prefer|prefers|preferred|always|usually|favorite|favourite)\b/.test(
      lower,
    )
  ) {
    return "preference";
  }
  if (
    /\b(will|going to|plan to|planning to|upcoming|next week|scheduled)\b/.test(
      lower,
    )
  ) {
    return "plan";
  }
  if (
    hasDate ||
    /\b(met|flew|booked|attended|yesterday|last week|last night|happened|on-site)\b/.test(
      lower,
    ) ||
    type === "episodic"
  ) {
    return "event";
  }
  if (
    /\b(currently|now|is now|based in|lives in|live in)\b/.test(lower) ||
    type === "profile"
  ) {
    return "state";
  }
  return null;
}

export function inferTemporalFields(
  title: string,
  content: string,
  nowMs: number,
  type?: MemoryType,
): TemporalFields {
  const text = `${title}\n${content}`;
  const dates = parseDatesInText(text, nowMs);
  const temporalKind = inferKind(text, type, dates.length > 0);
  if (temporalKind === null && dates.length === 0) {
    return { eventStart: null, eventEnd: null, temporalKind: null };
  }
  const startMs = dates[0]?.startMs;
  const endMs = dates.length === 0 ? undefined : dates[dates.length - 1]?.endMs;
  return {
    temporalKind,
    eventStart: startMs === undefined ? null : new Date(startMs).toISOString(),
    eventEnd: endMs === undefined ? null : new Date(endMs).toISOString(),
  };
}

export function toTemporalStoreFields(fields: TemporalFields): {
  eventStart: number | null;
  eventEnd: number | null;
  temporalKind: TemporalKind | null;
} {
  return {
    temporalKind: fields.temporalKind,
    eventStart: parseMillis(fields.eventStart) ?? null,
    eventEnd: parseMillis(fields.eventEnd) ?? null,
  };
}

function isoOrNull(ms: number | null | undefined): string | null {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function temporalFieldsFromStore(args: {
  eventStart?: number | null;
  eventEnd?: number | null;
  temporalKind?: TemporalKind | null;
}): TemporalFields {
  return {
    eventStart: isoOrNull(args.eventStart),
    eventEnd: isoOrNull(args.eventEnd),
    temporalKind: args.temporalKind ?? null,
  };
}

interface MemorySpan {
  startMs: number;
  endMs: number;
  kind: TemporalKind | null;
}

function memorySpan(
  memory: Pick<
    MemoryWithTags,
    | "title"
    | "content"
    | "type"
    | "createdAt"
    | "updatedAt"
    | "eventStart"
    | "eventEnd"
    | "temporalKind"
  >,
  nowMs: number,
): MemorySpan {
  const inferred = inferTemporalFields(
    memory.title,
    memory.content,
    nowMs,
    memory.type,
  );
  const kind = memory.temporalKind ?? inferred.temporalKind;
  const startMs =
    parseMillis(memory.eventStart) ??
    parseMillis(inferred.eventStart) ??
    parseMillis(memory.updatedAt) ??
    parseMillis(memory.createdAt) ??
    nowMs;
  const storedEnd =
    parseMillis(memory.eventEnd) ?? parseMillis(inferred.eventEnd);
  const openEnded =
    kind === "state" || kind === "plan" || kind === "preference";
  const fallbackEnd = openEnded ? nowMs : startMs + MS_PER_DAY;
  const endMs = Math.max(startMs + MS_PER_DAY, storedEnd ?? fallbackEnd);
  return { startMs, endMs, kind };
}

function overlapScore(a0: number, a1: number, b0: number, b1: number): number {
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  if (end > start) {
    const inter = end - start;
    const shorter = Math.max(1, Math.min(a1 - a0, b1 - b0));
    return clamp01(inter / shorter);
  }
  const gap = start - end;
  return clamp01(Math.exp(-gap / (14 * MS_PER_DAY)) * 0.2);
}

export function temporalScore(
  memory: Pick<
    MemoryWithTags,
    | "title"
    | "content"
    | "type"
    | "createdAt"
    | "updatedAt"
    | "eventStart"
    | "eventEnd"
    | "temporalKind"
  >,
  intent: QueryTemporalIntent,
  nowMs: number,
): number {
  if (intent.kind === "none" || intent.kind === "preference") return 0;
  const span = memorySpan(memory, nowMs);
  if (intent.kind === "current") {
    if (span.kind === "event" && span.endMs < nowMs - 14 * MS_PER_DAY) {
      return 0.05;
    }
    if (span.kind === "state" || span.kind === "plan") {
      const age = Math.max(0, nowMs - span.startMs);
      return clamp01(Math.exp(-age / (60 * MS_PER_DAY)));
    }
    return overlapScore(
      nowMs - 3 * MS_PER_DAY,
      nowMs,
      span.startMs,
      span.endMs,
    );
  }
  if (intent.kind === "window") {
    const overlap = overlapScore(
      intent.startMs,
      intent.endMs,
      span.startMs,
      span.endMs,
    );
    const kindBoost =
      span.kind === "event" ? 1 : span.kind === "plan" ? 0.35 : 0.15;
    return clamp01(overlap * kindBoost);
  }
  if (span.kind === "plan") return 1;
  if (span.startMs > nowMs) return 0.65;
  return 0.08;
}
