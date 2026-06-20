/**
 * Pure aggregation over graded QA rows. No IO — fed by `results.ts`.
 *
 * Headline metric is LLM-judge accuracy (J): fraction of questions the judge
 * marked CORRECT, reported overall and per LoCoMo category. Token efficiency
 * (mean context tokens per question) and search latency (p50/p95) round out
 * the table.
 */

import type { QaResultRow } from "./results";

export interface CategoryMetrics {
  category: number;
  label: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ProviderMetrics {
  provider: string;
  total: number;
  correct: number;
  accuracy: number;
  perCategory: CategoryMetrics[];
  meanContextTokens: number;
  searchLatencyP50: number;
  searchLatencyP95: number;
  /** Questions whose judge response failed to parse (counted as WRONG). */
  judgeParseFailures: number;
}

/** Nearest-rank percentile on a copy of the values. Empty → 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function accuracy(correct: number, total: number): number {
  return total === 0 ? 0 : correct / total;
}

export function computeProviderMetrics(
  provider: string,
  rows: QaResultRow[],
): ProviderMetrics {
  const own = rows.filter((r) => r.provider === provider);
  const correct = own.filter((r) => r.correct).length;

  const byCategory = new Map<number, { label: string; rows: QaResultRow[] }>();
  for (const row of own) {
    const bucket = byCategory.get(row.category) ?? {
      label: row.categoryLabel,
      rows: [],
    };
    bucket.rows.push(row);
    byCategory.set(row.category, bucket);
  }

  const perCategory: CategoryMetrics[] = Array.from(byCategory.entries())
    .map(([category, bucket]) => {
      const catCorrect = bucket.rows.filter((r) => r.correct).length;
      return {
        category,
        label: bucket.label,
        total: bucket.rows.length,
        correct: catCorrect,
        accuracy: accuracy(catCorrect, bucket.rows.length),
      };
    })
    .sort((a, b) => a.category - b.category);

  return {
    provider,
    total: own.length,
    correct,
    accuracy: accuracy(correct, own.length),
    perCategory,
    meanContextTokens: mean(own.map((r) => r.contextTokens)),
    searchLatencyP50: percentile(
      own.map((r) => r.searchLatencyMs),
      50,
    ),
    searchLatencyP95: percentile(
      own.map((r) => r.searchLatencyMs),
      95,
    ),
    judgeParseFailures: own.filter((r) => !r.judgeParsed).length,
  };
}

/** Distinct provider names present in the rows, in first-seen order. */
export function providersIn(rows: QaResultRow[]): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    if (!seen.includes(row.provider)) seen.push(row.provider);
  }
  return seen;
}
