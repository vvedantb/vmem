/**
 * Memory usefulness score (0..1). Pure and engine-side: no Convex imports.
 * Deliberate sources start high. Passive sources start low and fade fast
 * unless they are used.
 */

const MS_PER_DAY = 86_400_000;

export type SourcePriorClass = "high" | "medium" | "low";

export const SOURCE_PRIOR: Record<SourcePriorClass, number> = {
  high: 0.92,
  medium: 0.62,
  low: 0.34,
};

export const SOURCE_HALF_LIFE_DAYS: Record<SourcePriorClass, number> = {
  high: 365,
  medium: 90,
  low: 14,
};

/** Weight of usefulness in the final retrieve score. */
export const USEFULNESS_BLEND = 0.15;
/** Weight of the heuristic when a Jev quality score exists. */
export const HEURISTIC_BLEND = 0.72;

const HIGH_SOURCES = new Set([
  "mcp",
  "manual",
  "agent",
  "api",
  "instruction",
  "user",
  "web",
]);
const LOW_SOURCES = new Set([
  "bookmarks",
  "browsing-history",
  "desktop",
  "history",
  "chrome",
]);
const MEDIUM_SOURCES = new Set([
  "google_drive",
  "notion",
  "gmail",
  "figma",
  "github",
  "file-upload",
  "file-node",
  "file",
  "import",
  "screenshot",
  "connector",
]);

export interface UsefulnessInput {
  source: string;
  sourceType?: string | null;
  pinned: boolean;
  /** ms since epoch. */
  updatedAt?: number;
  createdAt?: number;
  nowMs: number;
  retrieveHits?: number;
  searchHits?: number;
  contextPackHits?: number;
  userEdits?: number;
  jevQuality?: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function classOf(value: string): SourcePriorClass | undefined {
  const key = value.trim().toLowerCase();
  if (LOW_SOURCES.has(key)) return "low";
  if (HIGH_SOURCES.has(key)) return "high";
  if (MEDIUM_SOURCES.has(key) || key.startsWith("import:")) return "medium";
  return undefined;
}

/** Either `source` or `sourceType` may match. The lowest class wins. */
export function classifySource(
  source: string,
  sourceType?: string | null,
): SourcePriorClass {
  const found = [source, sourceType ?? ""]
    .map(classOf)
    .filter((c): c is SourcePriorClass => c !== undefined);
  if (found.includes("low")) return "low";
  if (found.includes("medium")) return "medium";
  if (found.includes("high")) return "high";
  return "medium";
}

export function sourcePrior(
  source: string,
  sourceType?: string | null,
): number {
  return SOURCE_PRIOR[classifySource(source, sourceType)];
}

export function usefulnessDecay(input: {
  cls: SourcePriorClass;
  pinned: boolean;
  updatedAt?: number;
  createdAt?: number;
  nowMs: number;
}): number {
  if (input.pinned) return 1;
  const ts = input.updatedAt ?? input.createdAt;
  if (ts === undefined || !Number.isFinite(ts)) return 1;
  const ageDays = Math.max(0, (input.nowMs - ts) / MS_PER_DAY);
  return 2 ** (-ageDays / SOURCE_HALF_LIFE_DAYS[input.cls]);
}

export function usageScore(input: {
  retrieveHits?: number;
  searchHits?: number;
  contextPackHits?: number;
  userEdits?: number;
  pinned: boolean;
}): number {
  const exponent =
    0.15 * (input.retrieveHits ?? 0) +
    0.1 * (input.searchHits ?? 0) +
    0.25 * (input.contextPackHits ?? 0) +
    0.35 * (input.userEdits ?? 0) +
    (input.pinned ? 1.2 : 0);
  return clamp01(1 - Math.exp(-exponent));
}

export function heuristicUsefulness(input: UsefulnessInput): number {
  const cls = classifySource(input.source, input.sourceType);
  const decay = usefulnessDecay({ ...input, cls });
  const usage = usageScore(input);
  return clamp01(
    SOURCE_PRIOR[cls] * (0.45 + 0.55 * decay) * (0.55 + 0.45 * usage),
  );
}

export function computeUsefulness(input: UsefulnessInput): number {
  const heuristic = heuristicUsefulness(input);
  const jev = input.jevQuality;
  if (jev === undefined || !Number.isFinite(jev) || jev < 0 || jev > 1) {
    return heuristic;
  }
  return clamp01(HEURISTIC_BLEND * heuristic + (1 - HEURISTIC_BLEND) * jev);
}

/** final = 0.85 * relevance + 0.15 * usefulness. */
export function blendRelevanceWithUsefulness(
  relevance: number,
  usefulness: number,
): number {
  return clamp01(
    (1 - USEFULNESS_BLEND) * relevance + USEFULNESS_BLEND * usefulness,
  );
}

/** Low-prior sources are high volume and passive: heuristic only, no Jev. */
export function jevEligible(
  source: string,
  sourceType?: string | null,
): boolean {
  return classifySource(source, sourceType) !== "low";
}

/**
 * Jev queue tier, lowest first: 0 high-prior source, 1 new or edited medium
 * source, 2 medium source reached only by a backfill.
 */
export function jevPriority(
  source: string,
  sourceType: string | null | undefined,
  origin: "live" | "backfill",
): number {
  if (classifySource(source, sourceType) === "high") return 0;
  return origin === "live" ? 1 : 2;
}
